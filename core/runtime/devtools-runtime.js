window.TrackerLensDevToolsRuntime = (() => {
  const SCHEMA_VERSION = "1.0.0";

  const safeList = async (fn, fallback = []) => {
    try {
      return typeof fn === "function" ? await fn() : fallback;
    } catch (error) {
      console.warn("DevTools runtime source non disponibile:", error);
      return fallback;
    }
  };

  const safeValue = async (fn, fallback = null) => {
    try {
      return typeof fn === "function" ? await fn() : fallback;
    } catch (error) {
      console.warn("DevTools runtime source non disponibile:", error);
      return fallback;
    }
  };

  const load = async () => {
    const graph = await safeValue(() => window.TrackerLensGraphEngine?.buildGraph?.(), null);
    const offline = await safeValue(() => window.TrackerLensOfflineFirst?.status?.(), null);
    const offlineQueue = await safeList(window.TrackerLensOfflineFirst?.listQueue);
    const offlineCache = await safeList(window.TrackerLensOfflineFirst?.listCache);
    const packages = await safeList(window.TrackerLensPackageSystem?.listPackages);
    const packageLocks = await safeList(window.TrackerLensPackageSystem?.listLocks);
    const snapshots = await safeList(window.TrackerLensTimeTravelStore?.list);
    const performance = await safeList(window.TrackerLensBoxPerformanceMonitor?.list);
    const ai = await safeValue(() => window.TrackerLensAiRuntimeStore?.list?.(), null);

    return {
      schemaVersion: SCHEMA_VERSION,
      graph,
      offline,
      offlineQueue,
      offlineCache,
      packages,
      packageLocks,
      snapshots,
      performance,
      ai,
      stats: {
        graphNodes: graph?.stats?.nodes || 0,
        graphDependencies: graph?.stats?.dependencies || 0,
        queuedOffline: offline?.pendingCount || 0,
        packages: packages.length,
        snapshots: snapshots.length,
        performanceRecords: performance.length,
      },
      loadedAt: new Date().toISOString(),
    };
  };

  return {
    SCHEMA_VERSION,
    load,
  };
})();
