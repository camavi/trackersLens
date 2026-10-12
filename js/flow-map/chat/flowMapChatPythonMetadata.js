// Pure Flow Chat metadata helpers. Load before flowMapPromptChat.js.
const flowMapChatPythonMetadata = (() => {
  // The Core catalog is intentionally path-free. Keep the provider boundary
  // explicit as well, so later internal catalog additions cannot accidentally
  // turn the chat into filesystem or shell access.
  const flowPromptSafePythonCatalog = (catalog = {}) => ({
    schemaVersion: String(catalog?.schemaVersion || "tl-python-runtime-catalog/v1"),
    environments: (Array.isArray(catalog?.environments) ? catalog.environments : []).map((environment) => ({
      id: String(environment?.id || "python"),
      requested: Boolean(environment?.requested),
      enabled: Boolean(environment?.enabled),
      interpreterInstalled: Boolean(environment?.interpreterInstalled),
      runtime: {
        status: String(environment?.runtime?.status || "unknown"),
      },
    })),
    packs: (Array.isArray(catalog?.packs) ? catalog.packs : []).map((pack) => ({
      id: String(pack?.id || "python-pack"),
      version: String(pack?.version || ""),
      environmentId: String(pack?.environmentId || ""),
      state: String(pack?.state || "unknown"),
      trustLevel: String(pack?.trustLevel || "unknown"),
      installPolicy: String(pack?.installPolicy || "managed-optional"),
      python: String(pack?.python || ""),
      requirements: (Array.isArray(pack?.requirements) ? pack.requirements : []).map((requirement) => ({
        name: String(requirement?.name || ""),
        version: String(requirement?.version || ""),
      })),
      capabilities: (Array.isArray(pack?.capabilities) ? pack.capabilities : []).map(String),
      dataAccess: String(pack?.dataAccess || "TL-authorized inputs only"),
      modelIds: (Array.isArray(pack?.modelIds) ? pack.modelIds : []).map(String),
    })),
    models: (Array.isArray(catalog?.models) ? catalog.models : []).map((model) => ({
      id: String(model?.id || ""),
      environmentId: String(model?.environmentId || ""),
      displayName: String(model?.displayName || model?.id || "Model"),
      revision: String(model?.revision || ""),
      dimensions: Number(model?.dimensions || 0),
      languages: Number(model?.languages || 0),
      license: String(model?.license || "Unknown"),
      localOnlyAfterInstall: Boolean(model?.localOnlyAfterInstall),
      packIds: (Array.isArray(model?.packIds) ? model.packIds : []).map(String),
      state: String(model?.state || "unknown"),
      sizeBytes: Number(model?.sizeBytes || 0),
    })),
    limitations: ["Il catalogo non include percorsi locali, handle filesystem, comandi shell, credenziali o azioni di installazione/rimozione."],
  });

  const flowPromptSafePythonResolution = (result = {}, node = {}) => ({
    node: {
      id: String(node?.id || ""),
      label: String(node?.label || node?.id || "Node"),
      type: String(node?.type || ""),
      subtype: String(node?.subtype || ""),
    },
    status: String(result?.status || "unknown"),
    code: String(result?.code || ""),
    requirement: {
      packId: String(result?.requirement?.packId || ""),
      environment: String(result?.requirement?.environment || ""),
      requirements: (Array.isArray(result?.requirement?.requirements) ? result.requirement.requirements : []).map((item) => ({
        name: String(item?.name || ""),
        version: String(item?.version || ""),
      })),
      installPolicy: String(result?.requirement?.installPolicy || ""),
    },
    ...(result?.pack ? { pack: {
      id: String(result.pack.id || ""),
      version: String(result.pack.version || ""),
      environment: String(result.pack.environment || ""),
      trustLevel: String(result.pack.trustLevel || ""),
      packages: (Array.isArray(result.pack.packages) ? result.pack.packages : []).map((item) => ({ name: String(item?.name || ""), version: String(item?.version || "") })),
    } } : {}),
    ...(result?.installPlan ? { installPlan: {
      environment: String(result.installPlan.environment || ""),
      requirements: (Array.isArray(result.installPlan.requirements) ? result.installPlan.requirements : []).map((item) => ({ name: String(item?.name || ""), version: String(item?.version || "") })),
      installPolicy: String(result.installPlan.installPolicy || ""),
      requiresUserConsent: Boolean(result.installPlan.requiresUserConsent),
      supported: Boolean(result.installPlan.supported),
      packId: String(result.installPlan.packId || ""),
      packVersion: String(result.installPlan.packVersion || ""),
      trustLevel: String(result.installPlan.trustLevel || ""),
    } } : {}),
    limitations: ["La risoluzione legge soltanto il requisito dichiarato e lo stato del pack gestito; non include percorsi, shell o azioni di installazione."],
  });

  const flowPromptSafePythonNodeRuntimeStatus = (catalog = {}, resolution = {}) => {
    const requirement = resolution?.requirement || {};
    const pack = resolution?.pack || resolution?.installPlan || {};
    const environmentId = String(pack.environment || requirement.environment || "");
    const packId = String(pack.id || pack.packId || requirement.packId || "");
    const environment = (Array.isArray(catalog?.environments) ? catalog.environments : []).find((item) => String(item?.id || "") === environmentId) || null;
    const models = (Array.isArray(catalog?.models) ? catalog.models : [])
      .filter((model) => String(model?.environmentId || "") === environmentId && (Array.isArray(model?.packIds) ? model.packIds : []).map(String).includes(packId))
      .map((model) => ({
        id: String(model?.id || ""),
        displayName: String(model?.displayName || model?.id || "Model"),
        revision: String(model?.revision || ""),
        state: String(model?.state || "unknown"),
        dimensions: Number(model?.dimensions || 0),
        languages: Number(model?.languages || 0),
        license: String(model?.license || "Unknown"),
        sizeBytes: Number(model?.sizeBytes || 0),
      }));
    const runtimeStatus = String(environment?.runtime?.status || "unknown");
    const requirementStatus = String(resolution.status || "unknown");
    const environmentStatus = !environment
      ? "not-found"
      : environment.enabled && environment.interpreterInstalled ? "ready" : "unavailable";
    const modelStates = models.map((model) => String(model.state || "unknown"));
    const modelStatus = !models.length ? "not-found" : modelStates.every((state) => ["installed", "ready"].includes(state)) ? "ready" : "attention";
    const summaryText = runtimeStatus === "stopped"
      ? "Declared Python requirement, environment and models may be ready, but the managed runtime process is stopped."
      : runtimeStatus === "running"
        ? "Declared Python requirement is ready and the managed runtime process is running."
        : "Declared Python requirement and managed runtime process states are reported separately; do not infer one from the other.";
    return {
      node: resolution.node,
      resolutionStatus: requirementStatus,
      environment: environment ? {
        id: String(environment.id || ""),
        requested: Boolean(environment.requested),
        enabled: Boolean(environment.enabled),
        interpreterInstalled: Boolean(environment.interpreterInstalled),
        runtimeStatus: String(environment.runtime?.status || "unknown"),
      } : null,
      models,
      statusSummary: {
        requirementStatus,
        environmentStatus,
        runtimeStatus,
        modelStatus,
        summaryText,
        reportingRule: "Report requirementStatus, environmentStatus, runtimeStatus and modelStatus as separate facts. Never describe a stopped runtime as ready/running because its requirement or environment is ready.",
      },
      limitations: ["Lo stato riguarda l'ambiente Python gestito richiesto dal nodo; non avvia o riavvia il runtime e non include percorsi locali."],
    };
  };

  const flowPromptSafePythonInstallPlan = (plan = {}, node = {}) => ({
    schemaVersion: String(plan?.schemaVersion || "tl-python-install-plan/v1"),
    node: {
      id: String(node?.id || ""),
      label: String(node?.label || node?.id || "Node"),
    },
    pack: {
      id: String(plan?.pack?.id || ""),
      version: String(plan?.pack?.version || ""),
      trustLevel: String(plan?.pack?.trustLevel || ""),
      installPolicy: String(plan?.pack?.installPolicy || ""),
    },
    environment: {
      id: String(plan?.environment?.id || ""),
      action: String(plan?.environment?.action || ""),
    },
    requirements: (Array.isArray(plan?.requirements) ? plan.requirements : []).map((item) => ({ name: String(item?.name || ""), version: String(item?.version || "") })),
    models: (Array.isArray(plan?.models) ? plan.models : []).map((model) => ({
      id: String(model?.id || ""),
      displayName: String(model?.displayName || model?.id || "Model"),
      revision: String(model?.revision || ""),
      license: String(model?.license || "Unknown"),
      estimatedDownloadBytes: Number(model?.estimatedDownloadBytes || 0),
      artifactType: String(model?.artifactType || ""),
      source: String(model?.source || ""),
      installed: Boolean(model?.installed),
      networkRequired: Boolean(model?.networkRequired),
      resumeAvailable: Boolean(model?.resumeAvailable),
      partialBytes: Number(model?.partialBytes || 0),
    })),
    network: {
      required: Boolean(plan?.network?.required),
      reasons: (Array.isArray(plan?.network?.reasons) ? plan.network.reasons : []).map(String),
    },
    integrity: { versionPinned: Boolean(plan?.integrity?.versionPinned), hashesPresent: Boolean(plan?.integrity?.hashesPresent) },
    requiresUserConsent: Boolean(plan?.requiresUserConsent),
    limitations: ["Questo è un piano read-only. Non include percorsi, comandi shell o lockfile e non installa nulla."],
  });

  return {
    flowPromptSafePythonCatalog,
    flowPromptSafePythonResolution,
    flowPromptSafePythonNodeRuntimeStatus,
    flowPromptSafePythonInstallPlan
  };
})();
