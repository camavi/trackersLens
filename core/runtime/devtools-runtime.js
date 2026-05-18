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

  const load = async () => {
    const [graph, offline, packages, snapshots, performance] = await Promise.all([
      window.TrackerLensGraphEngine?.buildGraph?.() || Promise.resolve(null),
      window.TrackerLensOfflineFirst?.status?.() || Promise.resolve(null),
      safeList(window.TrackerLensPackageSystem?.listPackages),
      safeList(window.TrackerLensTimeTravelStore?.list),
      safeList(window.TrackerLensBoxPerformanceMonitor?.list),
    ]);

    return {
      schemaVersion: SCHEMA_VERSION,
      graph,
      offline,
      packages,
      snapshots,
      performance,
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
