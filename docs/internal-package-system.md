# Internal Package System

Il punto 14 introduce il registry locale per package interni Trackers Lens.

## Implementazione

Modulo:

```txt
core/runtime/package-system.js
```

Store:

- `tl_packages`
- `tl_package_lock`

Manifest normalizzato:

```js
{
  name: "@trackers/package",
  version: "0.1.0",
  type: "box|workspace|runtime|library",
  entry: "index.js",
  dependencies: {},
  permissions: {},
  compatibility: {}
}
```

API:

```js
TrackerLensPackageSystem.register(manifest, source)
TrackerLensPackageSystem.listPackages()
TrackerLensPackageSystem.resolveDependencies(manifest)
TrackerLensPackageSystem.lockWorkspace({ workspaceId, packages })
```

## Prossimi step

- Resolver semver reale.
- Package install da `.tlbox` / marketplace.
- Runtime permission enforcement per package.
- UI package inspector in DevTools.
