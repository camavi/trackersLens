# Box Versioning

Point 5 introduces a central version contract for every local box asset.

## Runtime Module

`core/runtime/box-versioning.js` exposes `window.TrackerLensBoxVersioning`.

Main APIs:

- `normalizeBox(box)`
- `normalizeVersioning(box)`
- `buildManifest(box, extra)`
- `bumpVersion(version, part)`
- `satisfiesRuntimeVersion(range, runtimeVersion)`
- `compareVersions(left, right)`
- `validateBox(box)`

## Contract

Every `boxLens` and `boxTracker` should persist:

```json
{
  "version": "0.1.0",
  "runtimeVersion": ">=0.1.0",
  "compatibility": {
    "runtime": ">=0.1.0",
    "dataChannels": [],
    "boxTypes": [],
    "dependencies": []
  },
  "changelog": [
    {
      "version": "0.1.0",
      "date": "2026-05-18",
      "notes": "Initial version"
    }
  ],
  "migration": {
    "policy": "none",
    "from": "",
    "to": "",
    "notes": ""
  },
  "versioning": {
    "contractVersion": "1.0.0",
    "version": "0.1.0",
    "runtimeVersion": ">=0.1.0",
    "compatibility": {},
    "changelog": [],
    "migration": {}
  }
}
```

The top-level fields stay duplicated intentionally. Older screens can keep reading `version`, while newer runtime code reads `versioning`.

## Editors

`editorBoxLens.html` and `editorBoxTracker.html` load the versioning runtime before their editor code.

- boxLens exposes versioning in the right properties panel.
- boxTracker exposes versioning in the `Avanzate` tab.
- Save normalizes existing legacy boxes automatically.
- boxLens `manifest.json` is generated from the central version contract.

## Portable Format

`.tlbox` exports include:

- normalized `box`
- `versioning` snapshot

`.tlworkspace` embedded assets are normalized before export. Import also normalizes every imported box before writing to `tl_widgets`.

## Current Limits

- Migration policies are metadata only for now.
- Compatibility ranges are enforced before workspace runtime mount through `validateBox()`.
- Changelog editing is intentionally minimal: the editor manages the current entry.
