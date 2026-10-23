const crypto = require('node:crypto');
const providerCatalog=require('../runtime/ai-provider-catalog.js');
const fail = (message, code = 'CUSTOM_NODE_LOGIN_AI_INVALID') => Object.assign(new Error(message), { code });

// Separate from the loopback broker: legacy aiProvider grants never authorize
// sending package data to an account provider. Core owns profile and transport.
class CustomNodeLoginAi {
  constructor({ persistence, bridge } = {}) {
    this.persistence = persistence;
    this.bridge = bridge;
    this.controllers = new Map();
  }

  cancel(executionId) {
    const active = [...(this.controllers.get(executionId) || [])];
    for (const controller of active) controller.abort();
    return Promise.allSettled(active.map(controller => controller.done));
  }

  async complete({ arguments: args = {}, request = {}, executionId = '' } = {}) {
    if (request.permissions?.externalAiProvider !== true) throw fail('Permesso Provider AI con login non concesso.', 'CUSTOM_NODE_LOGIN_AI_DENIED');
    if (Object.keys(args).some(key => !['messages', 'prompt'].includes(key))) throw fail('Il pacchetto può fornire solo messages o prompt; il profilo TL sceglie provider e modello.');
    const messages = args.messages ?? (typeof args.prompt === 'string' ? [{ role: 'user', content: args.prompt }] : null);
    if (!Array.isArray(messages) || !messages.length || messages.some(m => !m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string')) throw fail('Occorrono messaggi testuali system, user o assistant.');
    const providerId = String(request.config?.aiProviderId || '').trim();
    if (!providerId) throw fail('Seleziona aiProviderId dal profilo Login TL.');
    const controller = new AbortController(), pending = this.controllers.get(executionId) || new Set();
    let drained; controller.done = new Promise(resolve => { drained = resolve; });
    pending.add(controller); this.controllers.set(executionId, pending);
    let trace, writes = Promise.resolve(), persistenceError;
    const save = () => this.persistence.writeDevelopmentRecords({ storeName: 'tl_ai_logs', records: [structuredClone(trace)] });
    try {
      const records = await this.persistence.readDevelopmentRecords({ storeName: 'tl_ai_providers' });
      const record = request.package?.packageId==='tl.standard.llm-custom'?providerCatalog.find(records,providerId):records.find(record=>record.id===providerId), profile = record?.content || record, connection=providerCatalog.connection(profile), bridgeProvider=connection.bridgeProvider;
      if (!profile || connection.connectionType !== 'login' || !['codex','claude'].includes(bridgeProvider) || profile.endpoint || profile.baseUrl || profile.runtime?.endpoint) throw fail('Occorre un profilo Login TL esplicito, senza endpoint API.');
      const model = String((request.package?.packageId==='tl.standard.llm-custom'?request.config?.model:'')||profile.model||profile.defaultModel||'').trim();
      if (!model&&bridgeProvider==='codex') throw fail('Seleziona un modello nel profilo Login Codex.');
      const effective = { provider: bridgeProvider, model, reasoningEffort: String((request.package?.packageId==='tl.standard.llm-custom'?request.config?.reasoningEffort:'')||profile.defaultReasoningEffort||profile.reasoningEffort||''), speed: String((request.package?.packageId==='tl.standard.llm-custom'?request.config?.speed:'')||profile.defaultSpeed||profile.speed||'') };
      if(bridgeProvider!=='codex'){if(request.package?.packageId==='tl.standard.llm-custom'&&(request.config?.reasoningEffort||request.config?.speed))throw fail('Reasoning e speed sono impostazioni del Login Codex, non del Login Claude.');delete effective.reasoningEffort;delete effective.speed;}
      // Login transport accepts one prompt; retain both the ordered messages and
      // their complete, unambiguous serialization, without claiming role isolation.
      const prompt = JSON.stringify({ messages });
      trace = { id: crypto.randomUUID(), kind: 'custom-node-login-ai', executionId, nodeId: request.nodeId, workspaceId: request.context?.workspaceId || '', package: request.package, provider: { id: providerId, ...effective, connectionType: 'login' }, request: { messages, prompt }, events: [], status: 'running', startedAt: new Date().toISOString() };
      await save();
      if (controller.signal.aborted) throw fail('Generazione annullata.', 'CUSTOM_NODE_LOGIN_AI_CANCELLED');
      const result = await this.bridge.sendMessage({ ...effective, prompt }, {
        signal: controller.signal,
        onEvent: event => {
          trace.events.push(structuredClone(event));
          const snapshot = structuredClone(trace);
          writes = writes.then(() => this.persistence.writeDevelopmentRecords({ storeName: 'tl_ai_logs', records: [snapshot] })).catch(error => { persistenceError ||= error; controller.abort(); });
        }
      });
      await writes;
      if (persistenceError) throw persistenceError;
      if (controller.signal.aborted) throw fail('Generazione annullata.', 'CUSTOM_NODE_LOGIN_AI_CANCELLED');
      if (typeof result.text !== 'string') throw fail('Il provider non ha restituito testo.');
      trace.response = result; trace.status = 'completed'; trace.completedAt = new Date().toISOString(); await save();
      return { text: result.text, response: result, usage: result.raw?.usage ?? null, provenance: { source: 'tl-core-login-ai', invocationId: trace.id, providerId, model, provider: bridgeProvider, connectionType: 'login', transport: result.transport, promptSerialization: 'json-messages', sandbox: result.sandbox } };
    } catch (error) {
      await writes;
      if (trace) { trace.status = controller.signal.aborted && !persistenceError ? 'cancelled' : 'failed'; trace.error = { code: error.code || 'CUSTOM_NODE_LOGIN_AI_FAILED', message: error.message }; trace.completedAt = new Date().toISOString(); await save(); }
      throw error;
    } finally {
      drained(); pending.delete(controller); if (!pending.size) this.controllers.delete(executionId);
    }
  }
}
module.exports = { CustomNodeLoginAi };
