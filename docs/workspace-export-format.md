# Workspace Export Format

This is point 4 of the Trackers Lens runtime vision.

The portable formats are JSON documents with explicit format metadata:

- `.tlworkspace`
- `.tlbox`

Implementation:

```txt
core/runtime/workspace-portable.js
```

## `.tlbox`

```json
{
  "format": "tlbox",
  "formatVersion": "1.0.0",
  "kind": "box",
  "exportedAt": "2026-05-18T00:00:00.000Z",
  "app": {
    "name": "Trackers Lens",
    "origin": "http://127.0.0.1:3031"
  },
  "id": "lens_btc",
  "name": "BTC Lens",
  "box": {}
}
```

`box` is the normalized `tl_widgets.content` object.

## `.tlworkspace`

```json
{
  "format": "tlworkspace",
  "formatVersion": "1.0.0",
  "kind": "workspace",
  "exportedAt": "2026-05-18T00:00:00.000Z",
  "id": "workspace_crypto",
  "name": "Crypto Workspace",
  "workspace": {},
  "assets": [],
  "runtime": {
    "assetMode": "embedded",
    "graphMode": "embedded",
    "graph": {
      "channels": [],
      "nodes": [],
      "dependencies": [],
      "flows": []
    }
  }
}
```

`workspace` is the normalized `tl_pages.content` object.

`assets` contains embedded box records from `tl_widgets.content` for all workspace box `assetId` / `sourceId` references.

`runtime.graph` optionally embeds runtime graph records scoped to the workspace:

- `tl_channels`
- `tl_runtime_nodes`
- `tl_runtime_dependencies`
- `tl_flows`

## Current Behavior

- Library can import `.tlworkspace`, `.tlbox` or equivalent JSON.
- Library cards can export workspace and box records.
- Workspace editor can export the current workspace with embedded assets.
- Workspace export includes embedded runtime graph snapshots by default.
- Import writes boxes into `tl_widgets` and workspaces into `tl_pages`.
- Import can use conflict strategies: `overwrite`, `duplicate`, `skip`.
- `validateBundle()` reports format/kind errors before writing.

## Next Steps

- add conflict strategy UI: overwrite, duplicate or skip
- build version migrations on top of `formatVersion`
