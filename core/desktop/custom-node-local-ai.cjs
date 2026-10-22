const crypto = require('node:crypto');
const providerCatalog = require('../runtime/ai-provider-catalog.js');
const lmStudio = require('../runtime/lm-studio-native.js');
const fail = (message, code = 'CUSTOM_NODE_LOCAL_AI_INVALID') => Object.assign(new Error(message), { code });
const profileOf = record => record.content && typeof record.content === 'object' ? record.content : record;
const DEFAULT_LOCAL_CANDIDATES = {
  'lm-studio': { endpoint: 'http://127.0.0.1:1234/v1', source: 'https://lmstudio.ai/docs/developer/openai-compat' },
  ollama: { endpoint: 'http://127.0.0.1:11434', source: 'https://docs.ollama.com/api/tags' },
};

// A granted package can send text only to its explicitly configured local AI
// profile. Packages never choose URLs, headers, credentials or remote providers.
class CustomNodeLocalAi {
  constructor({ persistence, fetchImpl = globalThis.fetch, defaultCandidates = DEFAULT_LOCAL_CANDIDATES } = {}) {
    this.persistence = persistence;
    this.fetch = fetchImpl;
    this.defaultCandidates = defaultCandidates;
    this.controllers = new Map();
    this.discoveries = new Map();
    this.profilePlans = new Map();
    this.applyingProfiles = new Set();
  }

  describe(record) {
    const profile = profileOf(record);
    const type = String(profile.provider || profile.providerType || '').toLowerCase();
    let endpoint = '', protocol = '', issue = '';
    const model = String(profile.model || profile.defaultModel || profile.runtime?.model || '').trim();
    try {
      if (profile.connectionType === 'login' || ['codex', 'claude'].includes(type) && !(profile.endpoint || profile.baseUrl || profile.runtime?.endpoint)) throw fail('Account Login esterno: non è un servizio API locale.', 'CUSTOM_NODE_LOCAL_AI_EXTERNAL_LOGIN');
      if (!['ollama', 'lm-studio', 'lmstudio', 'openai', 'openai-compatible'].includes(type)) throw fail('Questo provider non supporta il broker API locale.');
      const url = new URL(profile.endpoint || profile.baseUrl || profile.runtime?.endpoint);
      if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash) throw fail('Occorre un endpoint loopback configurato, senza credenziali nell’URL.');
      endpoint = url.href.replace(/\/+$/, '');
      if (type === 'ollama') {
        protocol = 'ollama-chat';
        if (/\/api\/chat$/.test(endpoint)) { /* full configured endpoint */ }
        else if (url.pathname === '/') endpoint += '/api/chat';
        else throw fail('Il profilo Ollama deve indicare la base del servizio o /api/chat.');
      } else if (['lm-studio', 'lmstudio', 'openai', 'openai-compatible'].includes(type)) {
        protocol = 'chat-completions';
        if (/\/chat\/completions$/.test(endpoint)) { /* full configured endpoint */ }
        else if (url.pathname === '/') endpoint += '/v1/chat/completions';
        else endpoint += '/chat/completions';
      } else throw fail('Protocollo locale non supportato dal broker.');
      if (profile.connectionType === 'login') throw fail('Il broker locale richiede un profilo API.');
      if (!model) throw fail('Configura il modello nel profilo AI locale.');
    } catch (error) { issue = error.code ? error.message : 'Endpoint locale mancante o non valido.'; }
    return { id: String(record.id || ''), name: String(profile.name || type || 'Provider'), provider: type, model, endpoint: issue ? '' : endpoint, protocol, ready: !issue, issue, localOnly: true };
  }

  async list() {
    const records = await this.persistence.readDevelopmentRecords({ storeName: 'tl_ai_providers' });
    return { enabled: true, providers: records.map(record => this.describe(record)), contract: {
      tool: 'tools.ai.complete', configField: 'aiProviderId', arguments: { messages: 'Complete array of text messages: system/user/assistant; or prompt string' },
      permissions: { aiProvider: true }, localOnly: true, runtime: 'javascript',
      limitations: ['Solo profili API loopback configurati in TL; nessun accesso diretto alla rete.', 'Non scarica né avvia servizi/modelli Ollama o LM Studio.', 'Python tools.ai e provider esterni non disponibili in questo broker.'],
    } };
  }

  async discover({ service = 'lm-studio', endpoints = [] } = {}, { ownerId } = {}) {
    if (!Number.isInteger(ownerId)) throw fail('Owner desktop richiesto.');
    if (!this.defaultCandidates[service]) throw fail('Servizio locale non supportato.');
    if (!Array.isArray(endpoints)) throw fail('endpoints deve essere un elenco di basi API locali esplicite.');
    const records = await this.persistence.readDevelopmentRecords({ storeName: 'tl_ai_providers' });
    const candidates = new Map();
    const add = (endpoint, source, record = null) => {
      const candidate = this.describe({ id: 'probe', provider: service, endpoint, model: 'metadata-only' });
      if (!candidate.ready) throw fail(candidate.issue);
      const base = candidate.endpoint.replace(service === 'ollama' ? /\/api\/chat$/ : /\/chat\/completions$/, '');
      if (!candidates.has(base)) candidates.set(base, { endpoint: base, source, record });
    };
    for (const record of records) {
      const profile = profileOf(record);
      if (String(profile.provider || profile.providerType || '').toLowerCase().replace('lmstudio', 'lm-studio') !== service || profile.connectionType === 'login') continue;
      const endpoint = profile.endpoint || profile.baseUrl || profile.runtime?.endpoint;
      if (endpoint) { try { add(endpoint, { kind: 'configured-profile', providerId: record.id }, record); } catch (_) { /* unsupported profiles remain visible in list */ } }
    }
    for (const endpoint of endpoints) add(String(endpoint), { kind: 'user-supplied' });
    add(this.defaultCandidates[service].endpoint, { kind: 'documented-default-candidate', url: this.defaultCandidates[service].source });
    const results = await Promise.all([...candidates.values()].map(async candidate => {
      const url = `${candidate.endpoint}${service === 'ollama' ? '/api/tags' : '/models'}`;
      const profile = candidate.record ? profileOf(candidate.record) : {};
      const secret = String(profile.apiKey || profile.token || profile.secret || '').trim();
      const redact = value => secret ? String(value).split(secret).join('[credenziale rimossa]') : String(value);
      const headers = secret ? { Authorization: `Bearer ${secret}` } : {};
      try {
        const response = await this.fetch(url, { method: 'GET', redirect: 'error', headers });
        if (!response.ok) throw fail(`HTTP ${response.status}: ${redact(await response.text())}`);
        const raw = JSON.parse(redact(JSON.stringify(await response.json())));
        const items = service === 'ollama' ? raw.models : raw.data;
        if (!Array.isArray(items)) throw fail('Risposta catalogo modelli non riconosciuta.');
        const models = items.map(item => ({ id: String(service === 'ollama' ? item.name || item.model || '' : item.id || ''), metadata: item }));
        return { endpoint: candidate.endpoint, source: candidate.source, verified: true, modelCatalogUrl: url, models, raw, checkedAt: new Date().toISOString() };
      } catch (error) {
        return { endpoint: candidate.endpoint, source: candidate.source, verified: false, modelCatalogUrl: url, models: [], message: redact(error.message), checkedAt: new Date().toISOString() };
      }
    }));
    const discoveryId = crypto.randomUUID();
    this.discoveries.set(discoveryId, { ownerId, service, results: structuredClone(results) });
    return { discoveryId, service, results, limitations: ['Solo letture del catalogo: nessun prompt, avvio, download o modifica del profilo.', 'Un indirizzo predefinito è un candidato; solo una risposta verificata costituisce evidenza.', 'Il catalogo pubblicizzato non garantisce che un modello sia caricato o eseguibile.'] };
  }

  async previewProfile({ discoveryId = '', endpoint = '', model = '', providerId = '' } = {}, { ownerId } = {}) {
    const discovery = this.discoveries.get(String(discoveryId));
    if (!discovery || discovery.ownerId !== ownerId) throw fail('Rileva il servizio locale in questa finestra prima di configurarlo.');
    const evidence = discovery.results.find(item => item.verified && item.endpoint === endpoint && item.models.some(candidate => candidate.id && candidate.id === model));
    if (!evidence) throw fail('Endpoint e modello devono corrispondere esattamente al catalogo verificato.');
    const records = await this.persistence.readDevelopmentRecords({ storeName: 'tl_ai_providers' });
    const matching = records.filter(record => this.describe({ ...profileOf(record), id: record.id, model: 'metadata-only' }).endpoint === `${endpoint}${discovery.service === 'ollama' ? '/api/chat' : '/chat/completions'}`);
    if (!providerId && matching.length > 1) throw fail('Esistono più profili per questa destinazione: seleziona providerId.');
    const record = providerId ? records.find(item => item.id === providerId) : matching[0];
    if (providerId && (!record || !matching.some(item => item.id === providerId))) throw fail('Il profilo da aggiornare non appartiene alla destinazione verificata.');
    const id = record?.id || `local_${discovery.service.replace('-', '_')}_${crypto.createHash('sha256').update(endpoint).digest('hex')}`;
    const baseline = record || records.find(item => item.id === id) || null;
    if (!record && baseline) throw fail('Identità del nuovo profilo già occupata: rileggi i profili.');
    const values = { provider: discovery.service, name: record ? profileOf(record).name || discovery.service : discovery.service === 'ollama' ? 'Ollama' : 'LM Studio', endpoint, model, connectionType: 'api', local: true };
    const next = record?.content && typeof record.content === 'object' ? { ...record, content: { ...record.content, ...values } } : { ...(record || {}), id, ...values };
    const planId = crypto.randomUUID();
    this.profilePlans.set(planId, { ownerId, baseline: structuredClone(baseline), next, evidence: structuredClone(evidence) });
    return { planId, action: record ? 'update' : 'create', provider: this.describe(next), before: record ? this.describe(record) : null, evidence };
  }

  discardProfile({ planId = '' } = {}, { ownerId } = {}) {
    if (this.profilePlans.get(planId)?.ownerId !== ownerId) return { discarded: false };
    return { discarded: this.profilePlans.delete(planId) };
  }

  async applyProfile({ planId = '', confirmed = false } = {}, { ownerId } = {}) {
    if (confirmed !== true) throw fail('Conferma il profilo locale esatto.');
    const saved = this.profilePlans.get(String(planId));
    if (!saved || saved.ownerId !== ownerId) throw fail('Piano profilo scaduto o appartenente a un’altra finestra.');
    this.profilePlans.delete(String(planId));
    if (this.applyingProfiles.has(saved.next.id)) throw fail('Salvataggio di questo profilo già in corso.');
    this.applyingProfiles.add(saved.next.id);
    try {
      const records = await this.persistence.readDevelopmentRecords({ storeName: 'tl_ai_providers' });
      if (JSON.stringify(records.find(item => item.id === saved.next.id) || null) !== JSON.stringify(saved.baseline)) throw fail('Il profilo è cambiato. Rileggi e rivedi il piano prima di salvare.');
      // The exact observed URL/model are saved only after review; no runtime or
      // package/Flow change is performed and existing unrelated fields survive.
      if (!this.persistence.commitLocalAiProfile) throw fail('Salvataggio atomico del profilo non disponibile.');
      await this.persistence.commitLocalAiProfile({ expected: saved.baseline, next: saved.next });
      return { ok: true, status: 'configured', provider: this.describe(saved.next), provenance: { source: 'tl-core-local-discovery', evidence: saved.evidence } };
    } finally { this.applyingProfiles.delete(saved.next.id); }
  }

  cancel(executionId) {
    for (const controller of this.controllers.get(executionId) || []) controller.abort();
    this.controllers.delete(executionId);
  }

  async complete({ arguments: args = {}, request = {}, executionId = '' } = {}) {
    if (request.permissions?.aiProvider !== true) throw fail('Permesso Provider AI non concesso.', 'CUSTOM_NODE_LOCAL_AI_DENIED');
    let providerId = String(request.config?.aiProviderId || '').trim();
    if (!providerId && request.package?.packageId!=='tl.standard.llm-custom') throw fail('Configura aiProviderId con un profilo AI locale elencato da TL.');
    if (Object.keys(args).some(key => !['messages', 'prompt'].includes(key))) throw fail('Il pacchetto può fornire solo messages o prompt; destinazione e modello appartengono al profilo TL.');
    const messages = args.messages ?? (typeof args.prompt === 'string' ? [{ role: 'user', content: args.prompt }] : null);
    if (!Array.isArray(messages) || !messages.length || messages.some(item => !item || !['system', 'user', 'assistant'].includes(item.role) || typeof item.content !== 'string')) throw fail('Occorrono messaggi testuali con ruolo system, user o assistant.');
    const id = crypto.randomUUID(), controller = new AbortController();
    const pending = this.controllers.get(executionId) || new Set();
    pending.add(controller); this.controllers.set(executionId, pending);
    let trace = null, secret = '';
    const redact = value => secret ? String(value).split(secret).join('[credenziale rimossa]') : String(value);
    const save = () => trace ? this.persistence.writeDevelopmentRecords({ storeName: 'tl_ai_logs', records: [JSON.parse(redact(JSON.stringify(trace)))] }) : undefined;
    try {
      const records = await this.persistence.readDevelopmentRecords({ storeName: 'tl_ai_providers' });
      const standard=request.package?.packageId==='tl.standard.llm-custom';
      const record = standard ? providerCatalog.find(records,providerId) : records.find(item => String(item.id) === providerId);
      if (!record) throw fail('Il profilo AI locale selezionato non esiste.');
      providerId=record.id;
      const provider = this.describe(standard&&request.config?.model ? {...profileOf(record),id:record.id,model:request.config.model} : record);
      if (!provider.ready) throw fail(provider.issue, 'CUSTOM_NODE_LOCAL_AI_UNAVAILABLE');
      const profile = profileOf(record);
      secret = String(profile.apiKey || profile.token || profile.secret || '').trim();
      const headers = { 'Content-Type': 'application/json' };
      if (secret) headers.Authorization = `Bearer ${secret}`;
      if(standard&&request.config?.model)provider.model=String(request.config.model);
      if(standard&&['local-model','modello non configurato',''].includes(provider.model))throw fail('Seleziona un modello dal catalogo del provider TL.');
      const body = { model: provider.model, stream: false, messages: messages.map(({ role, content }) => ({ role, content })) };
      const ollama = provider.protocol === 'ollama-chat';
      const maxTokens = request.config?.maxTokens ?? profile.maxTokens ?? profile.runtime?.maxTokens;
      const temperature = request.config?.temperature ?? profile.temperature ?? profile.runtime?.temperature;
      const options = {};
      if (maxTokens !== undefined && maxTokens !== null && maxTokens !== '' && !(standard&&Number(maxTokens)===0)) {
        if (!Number.isSafeInteger(Number(maxTokens)) || Number(maxTokens) <= 0) throw fail('maxTokens deve essere un intero positivo esplicitamente configurato.');
        if (ollama) options.num_predict = Number(maxTokens); else body.max_tokens = Number(maxTokens);
      }
      if (temperature !== undefined && temperature !== null && temperature !== '') {
        if (!Number.isFinite(Number(temperature))) throw fail('temperature deve essere un numero finito.');
        if (ollama) options.temperature = Number(temperature); else body.temperature = Number(temperature);
      }
      if(standard){
        const topP=request.config?.topP;
        if(topP!==undefined&&topP!==''){if(!Number.isFinite(Number(topP))||Number(topP)<0||Number(topP)>1)throw fail('topP deve essere compreso tra 0 e 1');if(ollama)options.top_p=Number(topP);else body.top_p=Number(topP);}
        if(request.config?.responseFormat==='json'){if(ollama)body.format='json';else body.response_format={type:'json_object'};}
      }
      if (Object.keys(options).length) body.options = options;
      // The exact adapter used by ordinary AI nodes owns LM Studio protocol mapping.
      const native = standard && lmStudio.selected(profile,request.config);
      const outgoing = native ? lmStudio.prepare({url:provider.endpoint,body}) : null;
      const endpoint = native ? outgoing.url : provider.endpoint;
      const requestBody = native ? {...outgoing.body,stream:false} : body;
      trace = { id, kind: 'custom-node-local-ai', executionId, nodeId: request.nodeId, workspaceId: request.context?.workspaceId || '', package: request.package, provider:{...provider,protocol:native?'lm-studio-native':provider.protocol}, request:requestBody, status: 'running', startedAt: new Date().toISOString() };
      await save();
      if (controller.signal.aborted) throw fail('Richiesta LLM locale annullata.', 'CUSTOM_NODE_LOCAL_AI_CANCELLED');
      const response = await this.fetch(endpoint, { method: 'POST', redirect: 'error', headers, body: JSON.stringify(requestBody), signal: controller.signal });
      if (!response.ok) throw fail(`LLM locale HTTP ${response.status}: ${redact(await response.text())}`, 'CUSTOM_NODE_LOCAL_AI_HTTP');
      let data = JSON.parse(redact(JSON.stringify(await response.json())));
      trace.response = data;
      if (data.error) throw fail(typeof data.error === 'string' ? data.error : JSON.stringify(data.error), 'CUSTOM_NODE_LOCAL_AI_PROVIDER');
      if(native){trace.nativeSummary={};data=lmStudio.normalize(data,requestBody,trace.nativeSummary);trace.normalizedResponse=data;}
      const text = ollama ? data.message?.content : data.choices?.[0]?.message?.content;
      if (typeof text !== 'string') throw fail('Il provider non ha restituito un contenuto testuale.', 'CUSTOM_NODE_LOCAL_AI_RESPONSE');
      const finishReason = ollama ? data.done_reason || '' : data.choices?.[0]?.finish_reason || '';
      if (controller.signal.aborted) throw fail('Richiesta LLM locale annullata.', 'CUSTOM_NODE_LOCAL_AI_CANCELLED');
      trace.status = 'completed'; trace.completedAt = new Date().toISOString();
      await save();
      return { text, response: data, usage: data.usage || (ollama ? { promptTokens: data.prompt_eval_count ?? null, completionTokens: data.eval_count ?? null } : null), finishReason, incomplete:native?Boolean(trace.nativeSummary.tokenBudgetReached):['length','max_tokens'].includes(finishReason), ...(native?{nativeSummary:trace.nativeSummary}:{}), provenance: { source: 'tl-core-local-ai', invocationId: id, providerId, model: data.model || provider.model, endpoint, protocol:native?'lm-studio-native':provider.protocol, local:true } };
    } catch (error) {
      const diagnostic = { code: error.code || 'CUSTOM_NODE_LOCAL_AI_FAILED', message: redact(error.message) };
      if (trace) { trace.status = controller.signal.aborted ? 'cancelled' : 'failed'; trace.error = diagnostic; trace.completedAt = new Date().toISOString(); }
      await save();
      throw fail(diagnostic.message, diagnostic.code);
    } finally {
      pending.delete(controller); if (!pending.size) this.controllers.delete(executionId);
    }
  }
}
module.exports = { CustomNodeLocalAi };
