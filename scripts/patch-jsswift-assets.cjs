const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const cssDirectory = path.join(projectRoot, "node_modules", "jsswift", "dist", "css");
const localMaterialSymbolsUrl = "../../../../fonts/material-symbols-outlined.ttf";
const materialSymbolsSourcePattern = /url\((?:https:\/\/fonts\.gstatic\.com\/s\/materialsymbolsoutlined\/v311\/kJEhBvYX7BgnkSrUwT8OhrdQw4oELdPIeeII9v6oFsLjBuVY\.woff2|\.\.\/\.\.\/\.\.\/fonts\/material-symbols-outlined\.ttf|\.\.\/\.\.\/\.\.\/\.\.\/fonts\/material-symbols-outlined\.ttf)\)\s*format\(['"](?:woff2|truetype)['"]\)/g;
const cssFiles = ["base.css", "ui.css", "min-ui.css", "ui.min.css"];

for (const filename of cssFiles) {
  const cssPath = path.join(cssDirectory, filename);
  if (!fs.existsSync(cssPath)) continue;

  const source = fs.readFileSync(cssPath, "utf8");
  const patched = source.replace(
    materialSymbolsSourcePattern,
    `url(${localMaterialSymbolsUrl}) format('truetype')`,
  );
  if (patched !== source) fs.writeFileSync(cssPath, patched);
}
