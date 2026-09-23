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
