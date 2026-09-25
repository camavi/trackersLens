const crypto = require("node:crypto");
const { resolveSettings } = require("./custom-node-settings.cjs");
const TOOL = Object.freeze({ name: "migrateCustomNodeVersion", status: "ready", mutates: true });
const STORES = ["tl_packages", "tl_runtime_nodes", "tl_runtime_dependencies", "tl_connections", "tl_channels"];
const fail = (message) => Object.assign(new Error(message), { code: "CUSTOM_NODE_MIGRATION_BLOCKED" });
const equal = require("node:util").isDeepStrictEqual;
const reference = (record) => ({ packageId: record.packageId, version: record.version, archiveSha256: record.archive?.sha256 });
const matches = (node, ref) => node.metadata?.customPackage?.packageId === ref.packageId && node.metadata.customPackage.version === ref.version && node.metadata.customPackage.archive?.sha256 === ref.archiveSha256;

// Registered Core mutation tool: preview token, fresh validation, SQLite CAS,
// Time Travel snapshot and node writes form one atomic operation.
class CustomNodeMigration {
  constructor({ manager, persistence, isRunning = () => false }) {
    this.manager = manager; this.persistence = persistence; this.isRunning = isRunning; this.plans = new Map();
  }
  async readState() {
    return Object.fromEntries(await Promise.all(STORES.map(async (name) => [name, await this.persistence.readDevelopmentRecords({ storeName: name })])));
  }
  async build({ source, target }) {
    if (this.isRunning()) throw fail("Attendi la conclusione delle esecuzioni Custom Node.");
    const previous = await this.manager.resolvePackage(source), next = await this.manager.resolvePackage(target);
    if (previous.packageId !== next.packageId || equal(reference(previous), reference(next))) throw fail("Seleziona due pacchetti distinti dello stesso nodo.");
    // Verifies activation, permissioned catalog identity and archive integrity.
    await this.manager.loadSandboxRuntime(target);
    if (next.permissionConsent?.status !== "granted") throw fail("Concedi prima i permessi della versione di destinazione.");
    for (const key of ["inputs", "outputs"]) {
      if ((previous.manifest[key] || []).some((port) => !next.manifest[key].includes(port))) throw fail("La destinazione rimuove porte. È necessario adattare esplicitamente i collegamenti prima della migrazione.");
    }
    const expected = await this.readState();
    if (!equal(expected.tl_packages.find((r) => r.id === previous.id), previous) || !equal(expected.tl_packages.find((r) => r.id === next.id), next)) throw fail("Catalogo modificato durante la verifica. Riprova.");
    const nodes = expected.tl_runtime_nodes.filter((node) => matches(node, source));
    if (!nodes.length) throw fail("Nessun nodo usa questa esatta versione.");
    const after = nodes.map((node) => {
      if (["running", "working", "processing", "queued"].includes(node.runtime?.status)) throw fail(`Il nodo ${node.label || node.id} è in esecuzione.`);
      for (const key of ["inputs", "outputs"]) {
        if ((node[key] || []).some((port) => !next.manifest[key].includes(typeof port === "string" ? port : port.name || port.id))) throw fail(`Il nodo ${node.label || node.id} usa porte non presenti nella destinazione.`);
      }
      const config = resolveSettings(next.manifest.settingsSchema || {}, node.metadata?.config || {});
      const declaredPermissions = Object.entries(next.permissions || {}).filter(([, value]) => value && value !== "none").map(([key, value]) => value === true ? `custom.${key}` : `custom.${key}.${value}`);
      return { ...node, inputs: next.manifest.inputs, outputs: next.manifest.outputs,
        metadata: { ...node.metadata, config, settingsSchema: next.manifest.settingsSchema || {},
          manifest: { ...next.manifest, permissions: declaredPermissions }, permissions: declaredPermissions,
          customPackage: { ...node.metadata.customPackage, ...reference(next), archive: next.archive, installState: next.installState, runtimeExecution: next.runtimeExecution, declaredPermissions: next.permissions, trustLevel: next.trustLevel },
          runtimeBlocked: false, runtimeStatus: "" },
        runtime: { ...node.runtime, status: "idle" }
      };
    });
    return { expected, nodes, after, source, target };
  }
  async preview(payload) {
    const plan = await this.build(payload);
    const planId = crypto.randomUUID();
    this.plans.set(planId, plan);
    return { planId, tool: TOOL, source: plan.source, target: plan.target,
      nodes: plan.nodes.map((node, index) => ({ id: node.id, name: node.label || node.name || node.id, workspaceId: node.workspaceId, beforeConfig: node.metadata?.config || {}, afterConfig: plan.after[index].metadata.config })),
      message: "Saranno aggiornati solo i nodi elencati. Collegamenti, ID e dati prodotti rimangono salvati." };
  }
  async apply({ planId, confirmed }) {
    if (confirmed !== true) throw fail("Conferma esplicitamente la migrazione.");
    const plan = this.plans.get(planId);
    if (!plan) throw fail("Anteprima non disponibile. Ripeti il confronto.");
    const fresh = await this.build(plan);
    if (!equal(plan.expected, fresh.expected)) throw fail("Lo stato è cambiato dopo l’anteprima. Verifica un nuovo piano.");
    const snapshotId = `tt_custom_${crypto.randomUUID()}`;
    const snapshot = { id: snapshotId, schemaVersion: "1.0.0", workspaceId: "global", reason: TOOL.name, label: `${plan.source.version} → ${plan.target.version}`, createdAt: new Date().toISOString(), restoreMode: "custom-node-migration", state: { runtimeNodes: plan.nodes }, migration: { source: plan.source, target: plan.target, after: plan.after, topology: Object.fromEntries(["tl_runtime_dependencies", "tl_connections", "tl_channels"].map((key) => [key, plan.expected[key]])) } };
    if (this.isRunning()) throw fail("Attendi la conclusione delle esecuzioni Custom Node.");
    this.persistence.commitCustomNodeMigration({ expected: plan.expected, records: plan.after, snapshot });
    this.plans.delete(planId);
    return { snapshotId, updated: plan.after.length, tool: TOOL.name };
  }
  async history({ packageId }) {
    const snapshots = await this.persistence.readDevelopmentRecords({ storeName: "tl_time_travel_snapshots" });
    return snapshots.filter((record) => record.restoreMode === "custom-node-migration" && record.migration?.source?.packageId === packageId).map((record) => ({ snapshotId: record.id, createdAt: record.createdAt, label: record.label, restoredAt: record.restoredAt || "", nodeCount: record.state.runtimeNodes.length }));
  }
  async restore({ snapshotId, confirmed }) {
    if (confirmed !== true) throw fail("Conferma esplicitamente il ripristino.");
    if (this.isRunning()) throw fail("Attendi la conclusione delle esecuzioni Custom Node.");
    const snapshot = await this.persistence.readDevelopmentRecordById({ storeName: "tl_time_travel_snapshots", id: snapshotId });
    if (snapshot?.restoreMode !== "custom-node-migration" || snapshot.restoredAt) throw fail("Snapshot non disponibile per il ripristino.");
    const expected = await this.readState();
    for (const [key, records] of Object.entries(snapshot.migration.topology)) {
      if (!equal(expected[key], records)) throw fail("Collegamenti o canali modificati dopo la migrazione. Ripristino automatico annullato.");
    }
    for (const after of snapshot.migration.after) {
      if (!equal(expected.tl_runtime_nodes.find((node) => node.id === after.id), after)) throw fail("Un nodo è stato modificato dopo la migrazione. Ripristino automatico annullato per preservare le modifiche.");
    }
    await this.manager.resolvePackage(snapshot.migration.source);
    // Restore references/config only; source activation is rechecked at execution.
    const original = await this.manager.resolvePackage(snapshot.migration.source);
    const records = snapshot.state.runtimeNodes.map((node) => ({ ...node, metadata: { ...node.metadata, runtimeBlocked: original.runtimeExecution !== "sandboxed", customPackage: { ...node.metadata.customPackage, installState: original.installState, runtimeExecution: original.runtimeExecution } } }));
    if (this.isRunning()) throw fail("Attendi la conclusione delle esecuzioni Custom Node.");
    this.persistence.commitCustomNodeMigration({ expected, records, snapshot: { ...snapshot, restoredAt: new Date().toISOString() } });
    return { snapshotId, restored: records.length };
  }
}
module.exports = { CustomNodeMigration, TOOL, STORES };
