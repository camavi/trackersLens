const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

test("analytics DevTools action stays inside the desktop shell when a route is registered", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "analyticsView.js"), "utf8");
  const match = source.match(/const openDevTools = \(tab = "overview", extra = \{\}\) => \{[\s\S]*?\n\};/);
  assert.ok(match, "openDevTools helper is present");

  const navigations = [];
  const assigned = [];
  const context = vm.createContext({
    URLSearchParams,
    window: {
      TrackerLensSidebar: {
        navigate: (target) => {
          navigations.push(target);
          return true;
        },
      },
      location: { assign: (target) => assigned.push(target) },
    },
  });
  vm.runInContext(`${match[0]}; globalThis.openDevTools = openDevTools;`, context, { filename: "analyticsView.js" });

  context.openDevTools("events", { workspaceId: "demo" });
  assert.deepEqual(navigations, ["devtools.html?tab=events&workspaceId=demo"]);
  assert.deepEqual(assigned, []);
});
