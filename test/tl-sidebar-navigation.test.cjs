const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("internal sidebar navigation consumes the request without legacy document navigation", () => {
  const navigations = [];
  const assigned = [];
  const storage = new Map();
  const window = {
    location: {
      href: "file:///Users/example/trackerLens/app.html",
      assign: (url) => assigned.push(url),
    },
    addEventListener: () => {},
    TrackerLensAppRouter: {
      resolve: (pathname) => pathname.endsWith("/flowMap.html") ? {} : null,
      navigate: (target) => navigations.push(target),
      status: () => ({ renderer: "shell" }),
    },
  };
  const context = vm.createContext({
    window,
    URL,
    JSON,
    Date,
    console: { info: () => {} },
    sessionStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  });
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "tl-sidebar.js"), "utf8");
  vm.runInContext(source, context, { filename: "tl-sidebar.js" });

  assert.equal(window.TrackerLensSidebar.navigate("flowMap.html?workspaceId=demo"), true);
  assert.equal(navigations.length, 1);
  assert.deepEqual(assigned, []);
});

test("sidebar fallback loads the shell when the router is unavailable or not registered yet", () => {
  for (const router of [undefined, { resolve: () => null }]) {
    const assigned = [];
    const window = {
      location: { href: "file:///Users/example/trackerLens/app.html", assign: (url) => assigned.push(url) },
      TrackerLensAppRouter: router,
    };
    const context = vm.createContext({ window, URL });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "tl-sidebar.js"), "utf8"), context);
    assert.equal(window.TrackerLensSidebar.navigate("library.html?workspaceId=demo#assets"), true);
    assert.deepEqual(assigned, ["file:///Users/example/trackerLens/app.html?workspaceId=demo&tl-route=library.html#assets"]);
  }
});

test("the desktop router keeps every internal view under the app shell URL", () => {
  const window = {
    location: {
      href: "file:///Users/example/trackerLens/app.html?workspaceId=demo",
      pathname: "/Users/example/trackerLens/app.html",
      search: "?workspaceId=demo",
      hash: "",
    },
  };
  const context = vm.createContext({ window, URL, URLSearchParams, Map, String, Array, Object, TypeError });
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "tl-app-router.js"), "utf8");
  vm.runInContext(source, context, { filename: "tl-app-router.js" });

  assert.equal(
    window.TrackerLensAppRouter.canonicalize("flowMap.html?workspaceId=demo#canvas"),
    "/Users/example/trackerLens/app.html?workspaceId=demo&tl-route=flowMap.html#canvas"
  );
});

test("retired desktop entries cannot become document-navigation fallbacks again", () => {
  const retiredRoutes = [
    "library.html", "libraryFlowmap.html", "editorWorkspace.html", "flowMap.html",
    "connections.html", "database.html", "analytics.html", "ai.html", "settings.html",
    "profile.html", "pythonRuntime.html", "devtools.html",
  ];
  for (const route of retiredRoutes) {
    assert.equal(fs.existsSync(path.join(__dirname, "..", route)), false, `${route} must remain retired`);
  }
  assert.equal(fs.existsSync(path.join(__dirname, "..", "js", "tl-legacy-route-redirect.js")), false);
});

test("startup restores the workspace library and preserves active Flows", async () => {
  for (const saved of [null, 'library.html', 'libraryFlowmap.html', 'app.html', 'flowMap.html?workspaceId=demo']) {
    class Element {}
    const storage = new Map(saved ? [['tl.project.lastRoute', saved]] : []);
    let mounted = '';
    const window = {
      location: new URL('file:///example/app.html'),
      localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
      addEventListener() {},
      history: { replaceState(_state, _title, url) { window.location = new URL(url, window.location); } },
    };
    const context = vm.createContext({ window, URL, URLSearchParams, Element });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'tl-app-router.js'), 'utf8'), context);
    const router = window.TrackerLensAppRouter;
    const library = { mount() { mounted = 'library'; } };
    router.register('/app.html', library);
    router.register('/library.html', library);
    router.register('/libraryFlowmap.html', library);
    router.register('/flowMap.html', { mount({ location }) { mounted = location.query.get('workspaceId'); } });
    await router.start(new Element());
    assert.equal(mounted, saved?.startsWith('flowMap.html') ? 'demo' : 'library');
    if (saved === 'library.html' || saved === 'libraryFlowmap.html') {
      assert.equal(router.status().activePath, '/library.html');
      assert.equal(storage.get('tl.project.lastRoute'), 'library.html');
    }
  }
});

test("workspace card editing and opening use distinct editor and view destinations", () => {
  const destinations = [];
  const window = {
    TrackerLensAppRouter: {},
    TrackerLensSidebar: { navigate(url) { destinations.push(url); return true; } },
  };
  const context = vm.createContext({ window });
  const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'library.js'), 'utf8');
  vm.runInContext(source.replace(/\}\)\(\);\s*$/, 'window.testWorkspaceNavigation = { openBoxEditor, openWorkspaceView };})();'), context);
  window.testWorkspaceNavigation.openBoxEditor({ type: 'workspace', id: 'demo workspace' });
  window.testWorkspaceNavigation.openWorkspaceView('demo workspace');
  assert.deepEqual(destinations, [
    'editorWorkspace.html?workspaceId=demo%20workspace',
    'workspace.html?workspaceId=demo%20workspace',
  ]);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'workspace.html')), true);
});
