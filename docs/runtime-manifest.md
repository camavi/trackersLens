# Trackers Lens Runtime Manifest

Aggiornato il 2026-05-26.

Il manifest runtime e il contratto stabile per ogni nodo del Runtime Graph. La normalizzazione vive in:

- `core/runtime/runtime-manifest.js`

## Campi obbligatori

- `contractVersion`: versione del contratto manifest, oggi `1.0.0`.
- `version`: versione del nodo/asset.
- `runtimeVersion`: runtime minimo atteso dal nodo.
- `type`: `source`, `boxTracker`, `processor`, `aiAgent`, `boxLens`, `lens`, `action`, `storage` o `devPreview`.
- `subtype`: ruolo operativo concreto del nodo.
- `category`: famiglia UI/runtime.
- `inputs`: porte input tipizzate.
- `outputs`: porte output tipizzate.
- `permissions`: capacita richieste, per esempio `network.fetch`, `ai.invoke`, `indexeddb.write`.
- `settingsSchema`: schema dei controlli configurabili.
- `runtime`: metadati runtime non visuali.

## Porte

Ogni manifest deve esporre almeno una porta `inputs` e una porta `outputs`.
Se il nodo non dichiara una delle due liste, il normalizzatore assegna una porta default per mantenere esplicito il contratto runtime del nodo.

Ogni porta viene normalizzata come:

```json
{
  "name": "input",
  "type": "object",
  "schema": null,
  "required": false,
  "description": ""
}
```

Tipi porta supportati: `any`, `object`, `event`, `string`, `number`, `boolean`, `array`, `record`, `state`.

## API

- `TrackerLensRuntimeManifest.normalizePort(port, fallbackType)`
- `TrackerLensRuntimeManifest.normalizeManifest(manifest)`
- `TrackerLensRuntimeManifest.validateManifest(manifest)`

Flow Map usa ora questo normalizzatore quando crea o aggiorna manifest di Source, Tracker, Processor, AI Agent, Lens, Action e Storage.
