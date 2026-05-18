# Marketplace Verified

Il punto 9 introduce la fondazione locale per distinguere asset verificati, trusted, da revisionare o bloccati prima di aprire il marketplace remoto.

## Obiettivo

Trackers Lens resta local-first: il marketplace non deve eseguire codice senza un report di trust locale. Ogni `.tlbox`, `.tlworkspace` o asset in libreria deve poter avere:

- creator profile;
- firma/digest del payload;
- runtime safety report;
- permission report;
- review status;
- trust badge visibile nella Library.

## Implementazione

File principale:

```txt
core/runtime/marketplace-verification.js
```

Store IndexedDB:

```txt
tl_marketplace_trust
```

Indici:

- `assetId`
- `assetType`
- `status`
- `trustLevel`
- `updatedAt`

API principali:

```js
TrackerLensMarketplaceVerification.scanAsset(asset)
TrackerLensMarketplaceVerification.scanAssets(assets)
TrackerLensMarketplaceVerification.readAllReports()
TrackerLensMarketplaceVerification.enrichAssets(assets)
```

## Classificazione

Lo scanner genera un report con schema `1.0.0`:

```js
{
  assetId,
  assetType,
  creator,
  signature,
  runtime,
  review,
  status,
  trustLevel,
  score
}
```

Stati iniziali:

- `verified`: creator verificato, firma valida, runtime senza violazioni.
- `trusted`: creator locale/verificato e runtime senza violazioni, ma firma assente.
- `review_required`: asset non firmato, creator non verificato o mismatch firma.
- `blocked`: violazioni runtime rilevate dalla sandbox policy.

## Runtime safety

La verifica riusa `TrackerLensSandboxPolicy.validateBox()` quando disponibile. Le violazioni attuali includono:

- `eval`;
- `new Function`;
- `importScripts`;
- storage diretto non autorizzato;
- media/filesystem non autorizzati;
- `fetch`, `WebSocket` o clipboard senza permission.

## UI

`library.html` carica:

```txt
core/runtime/sandbox-policy.js
core/runtime/marketplace-verification.js
```

`js/library.js` mostra un badge per ogni asset:

- `Verified`
- `Trusted`
- `Review`
- `Blocked`
- `Unscanned`

Il bottone `Verify` esegue lo scan degli asset locali e persiste i report in `tl_marketplace_trust`.

## Limiti attuali

- Non esiste ancora un backend marketplace remoto.
- La firma e solo digest matching locale, non ancora firma crittografica con public key.
- La review e automatica/local-policy, non ancora moderazione remota.
- I workspace vengono verificati come bundle; gli asset embedded devono essere scansionati separatamente.

## Prossimi step

1. Aggiungere public key creator e verifica firma reale.
2. Aggiungere manifest marketplace ufficiale.
3. Collegare import `.tlbox` / `.tlworkspace` al report trust prima del salvataggio.
4. Creare pagina Marketplace con filtri `verified`, `trusted`, `review`, `blocked`.
5. Aggiungere policy permessi piu granulare per network domain allowlist.

## Nota test marketplace reale

Quando il marketplace remoto esistera, questo punto dovra essere ritestato end-to-end con asset scaricati davvero dal catalogo:

- creator verificato/non verificato;
- firma valida, mancante e mismatch;
- box con permission sicure e unsafe;
- workspace con asset embedded;
- import bloccato per `blocked`;
- downgrade da `verified` a `review_required` quando il payload cambia.
