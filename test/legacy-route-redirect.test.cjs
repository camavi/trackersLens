const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const desktopRoutes = [
  "library.html", "libraryFlowmap.html", "editorWorkspace.html", "flowMap.html",
  "connections.html", "database.html", "analytics.html", "ai.html", "settings.html",
  "profile.html", "pythonRuntime.html", "devtools.html",
];

test("legacy desktop entry points are lightweight shell redirects", () => {
  for (const route of desktopRoutes) {
    const source = fs.readFileSync(path.join(__dirname, "..", route), "utf8");
    assert.match(source, new RegExp(`data-tl-route="${route}"`));
    assert.match(source, /src="js\/tl-legacy-route-redirect\.js"/);
  }
});

test("legacy redirect preserves the target route, query and hash", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "tl-legacy-route-redirect.js"), "utf8");
  const replaced = [];
  const context = vm.createContext({
    URL,
    document: { currentScript: { dataset: { tlRoute: "flowMap.html" } } },
    window: {
      location: {
        href: "file:///Users/example/trackerLens/flowMap.html?workspaceId=demo#canvas",
        replace: (target) => replaced.push(target),
      },
    },
  });
  vm.runInContext(source, context, { filename: "tl-legacy-route-redirect.js" });
  assert.deepEqual(replaced, ["file:///Users/example/trackerLens/app.html?workspaceId=demo&tl-route=flowMap.html#canvas"]);
});
