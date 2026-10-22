const crypto = require('node:crypto');
const { normalizePermissions } = require('./custom-node-sandbox-contract.cjs');

const clone = value => JSON.parse(JSON.stringify(value));
const error = (message, code) => Object.assign(new Error(message), { code });
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const fingerprint = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
const exactReference = value => ({ packageId: String(value?.packageId || ''), version: String(value?.version || ''), archiveSha256: String(value?.archiveSha256 || '') });

// One reviewed, one-use plan; the existing managers remain the only writers.
// It is sequential setup, not a transaction over package files/model downloads.
class CustomNodeSetup {
  constructor({ packages, pythonInstaller, persistence, enabled = false } = {}) {
    this.packages = packages;
    this.pythonInstaller = pythonInstaller;
    this.persistence = persistence;
    this.enabled = enabled;
    this.plans = new Map();
    this.running = new Set();
    this.activeJobs = new Set();
  }

  async inspect(target) {
    if (!this.packages?.setupMaterial) throw error('Preparazione automatica non disponibile.', 'CUSTOM_NODE_SETUP_UNAVAILABLE');
    const { inspection, installed = null, pythonRuntime = null } = await this.packages.setupMaterial(target);
    const manifest = inspection.manifest;
    const reference = { packageId: manifest.id, version: manifest.version, archiveSha256: inspection.archiveSha256 };
    const actions = [];
    const limitations = [];
    let pythonPlan = null;
    if (!installed) actions.push('install');
    if (installed?.permissionConsent?.status !== 'granted') actions.push('permissions');
    if (!this.enabled) limitations.push('Il runtime sandbox dei Custom Node non è abilitato.');
    if (manifest.execution?.runtime === 'python' && pythonRuntime?.status !== 'ready') {
      const packId = manifest.execution.dependencies?.python?.packId;
      if (!packId || !pythonRuntime?.dependencies?.installPlan?.supported || !this.pythonInstaller?.getInstallPlan) {
        limitations.push(pythonRuntime?.message || 'Non esiste un piano Python gestito per questo nodo.');
      } else {
        pythonPlan = await this.pythonInstaller.getInstallPlan({ packId });
        actions.push('python');
      }
    }
    if (installed?.runtimeExecution !== 'sandboxed') actions.push('activate');
    return {
      reference, name: manifest.name, manifest, files: inspection.files || [],
      staticAnalysis: inspection.staticAnalysis || {}, permissions: normalizePermissions(manifest.permissions),
      grantedPermissions: installed?.grantedPermissions || {},
      permissionConsent: installed?.permissionConsent?.status || 'not-granted',
      runtimeExecution: installed?.runtimeExecution || 'uninstalled',
      pythonPlan, actions, status: limitations.length ? 'blocked' : 'ready', limitations,
    };
  }

  async preview(payload = {}, { ownerId } = {}) {
    if (!Number.isInteger(ownerId)) throw error('Owner desktop richiesto.', 'CUSTOM_NODE_SETUP_OWNER_REQUIRED');
    const target = payload.importId ? { importId: String(payload.importId) } : { reference: exactReference(payload.reference) };
    const plan = clone(await this.inspect(target));
    if (plan.status !== 'ready' || !plan.actions.length) return { ...plan, planId: '' };
    const planId = crypto.randomUUID();
    this.plans.set(planId, { ownerId, target, plan, hash: fingerprint(plan) });
    return { ...clone(plan), planId };
  }

  discard({ planId = '' } = {}, { ownerId } = {}) {
    const saved = this.plans.get(String(planId));
    if (!saved || saved.ownerId !== ownerId) return { discarded: false };
    this.plans.delete(String(planId));
    return { discarded: true };
  }

  async execute({ planId = '', confirmed = false } = {}, { ownerId, onProgress } = {}) {
    if (confirmed !== true) throw error('Conferma il piano completo.', 'CUSTOM_NODE_SETUP_CONFIRMATION_REQUIRED');
    const saved = this.plans.get(String(planId));
    if (!saved || saved.ownerId !== ownerId) throw error('Piano scaduto o non appartenente a questa finestra.', 'CUSTOM_NODE_SETUP_PLAN_INVALID');
    this.plans.delete(String(planId));
    const lock = canonical(saved.plan.reference);
    if (this.running.has(lock)) throw error('Preparazione di questo archivio già in corso.', 'CUSTOM_NODE_SETUP_IN_PROGRESS');
    this.running.add(lock);
    const job = { id: `custom-node-setup-${planId}`, kind: 'custom-node-setup', plan: clone(saved.plan), status: 'running', steps: [], events: [], startedAt: new Date().toISOString() };
    this.activeJobs.add(job.id);
    const persist = () => this.persistence?.writeDevelopmentRecords?.({ storeName: 'tl_ai_jobs', records: [clone(job)] });
    const progress = async (phase, message, detail = null) => {
      const event = { planId, phase, message, at: new Date().toISOString(), ...(detail ? { detail } : {}) };
      job.events.push(event);
      await persist();
      onProgress?.(clone(event));
    };
    const step = async (action, message, run) => {
      await progress(action, message);
      const result = await run();
      job.steps.push({ action, status: 'completed', result: clone(result ?? null), at: new Date().toISOString() });
      await persist();
      return result;
    };
    try {
      const fresh = await this.inspect(saved.target);
      if (fingerprint(fresh) !== saved.hash) throw error('Il pacchetto, i permessi o il piano Python sono cambiati. Rivedi il nuovo piano.', 'CUSTOM_NODE_SETUP_CHANGED');
      await progress('preparing', 'Piano verificato; avvio preparazione.');
      const reference = saved.plan.reference;
      let pkg;
      if (saved.plan.actions.includes('install')) pkg = await step('install', 'Installazione del pacchetto verificato…', () => this.packages.install({ importId: saved.target.importId }));
      // Recheck immutable archive material before granting the reviewed permissions.
      const installed = await this.packages.setupMaterial({ reference });
      if (fingerprint(installed.inspection.manifest) !== fingerprint(saved.plan.manifest) || installed.inspection.archiveSha256 !== reference.archiveSha256) throw error('Archivio installato diverso da quello approvato.', 'CUSTOM_NODE_SETUP_CHANGED');
      if (saved.plan.actions.includes('permissions')) pkg = await step('permissions', 'Registrazione dei permessi approvati…', () => this.packages.grantPermissions({ ...reference, permissions: saved.plan.permissions, confirmed: true }));
      if (saved.plan.pythonPlan) {
        const packId = saved.plan.pythonPlan.pack.id;
        const current = await this.pythonInstaller.getInstallPlan({ packId });
        if (fingerprint(current) !== fingerprint(saved.plan.pythonPlan)) throw error('Il piano Python è cambiato. Rivedi i download prima di proseguire.', 'CUSTOM_NODE_SETUP_CHANGED');
        await step('python', 'Installazione e verifica di Python e modelli dichiarati…', async () => {
          let writes = Promise.resolve();
          let progressError = null;
          const unsubscribe = this.pythonInstaller.subscribe?.(event => {
            if (event.packId === packId) writes = writes.then(() => progress(`python-${event.phase}`, event.message || event.phase, event)).catch(failure => { progressError = failure; });
          }) || (() => {});
          try { return await this.pythonInstaller.install({ packId, confirmed: true, expectedPlan: saved.plan.pythonPlan }); }
          finally { unsubscribe(); await writes; if (progressError) throw progressError; }
        });
      }
      if (saved.plan.actions.includes('activate')) pkg = await step('activate', 'Attivazione dell’archivio esatto…', () => this.packages.activateSandboxRuntime({ ...reference, confirmed: true }));
      job.status = 'completed';
      await progress('complete', 'Nodo installato e attivato.');
      return { ok: true, status: 'activated', reference, setupJobId: job.id, steps: clone(job.steps), runtimeExecution: pkg?.runtimeExecution || 'sandboxed' };
    } catch (failure) {
      job.status = job.steps.length ? 'partial' : 'failed';
      job.error = { code: failure.code || 'CUSTOM_NODE_SETUP_FAILED', message: failure.message };
      await progress('error', failure.message);
      return { ok: false, status: job.status, reference: saved.plan.reference, setupJobId: job.id, steps: clone(job.steps), ...job.error, limitations: ['I passaggi completati sono conservati. Nessuna ripetizione automatica: rileggi lo stato prima di proporre un nuovo piano.'] };
    } finally {
      job.completedAt = new Date().toISOString();
      try { await persist(); } finally { this.running.delete(lock); this.activeJobs.delete(job.id); }
    }
  }
}

module.exports = { CustomNodeSetup };
