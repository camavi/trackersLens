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
TrackerLensPackageSystem.resolvePackage({ name, range, type })
TrackerLensPackageSystem.resolveDependencies(manifest)
TrackerLensPackageSystem.installPackage({ workspaceId, manifest, name, range, source })
TrackerLensPackageSystem.lockWorkspace({ workspaceId, packages })
TrackerLensPackageSystem.satisfies(version, range)
```

## Resolver

Il resolver supporta:

- `latest` / `*`
- `=1.2.3`
- `>`, `>=`, `<`, `<=`
- `^1.2.3`
- `~1.2.3`

`installPackage()` risolve il package, valida le dependency disponibili e scrive `tl_package_lock` per il workspace.

## DevTools

`devtools.html?tab=packages` mostra package registrati, lock per workspace e inspector JSON. L'azione `Install latest` installa il package locale piu recente disponibile nel workspace globale.

## Stato

Il punto 14 e completo per il milestone corrente. Import marketplace remoto e permission enforcement package-specific restano futuri.
