# Online Marketplace Runtime

Purpose: product and implementation contract for publishing, acquiring and selling Trackers Lens artifacts.
Read when: changing online publication or acquisition of Custom Nodes, Flow Maps or Workspaces.
Last updated: 2026-10-03.

## Goal

Build one online marketplace with three explicitly typed artifact families:

- **Custom Node**: immutable `.tl-node.zip` release. It must re-enter the existing local import, review, permission-consent and activation lifecycle. Purchase or download never grants execution authority.
- **Flow Map**: versioned portable graph bundle. Import creates an isolated local copy; nodes remain paused and local dependencies are reported.
- **Workspace**: versioned portable workspace bundle. Import creates an isolated local copy and does not auto-start assets or nodes.

For each family, a publisher can offer a release at no charge or for a price. Free and paid are listing terms; payment entitlement, artifact delivery, refunds and publisher settlement must be enforced by the service, not inferred by the desktop client. Until payment contracts and provider capabilities are confirmed, paid purchase must not be represented as available.

## Active implementation (2026-10-02)

User-directed: begin the paid marketplace implementation across Trackers Lens desktop App and `trackersLens-site` web/backend, including publisher pricing/publication, buyer checkout/acquisition, and sales analytics. The anonymous public catalog has been user-confirmed complete and is no longer an outstanding task. Stripe is the selected payment provider direction. Stripe Connect and third-party publisher onboarding/payout model still need confirmation before enabling seller settlement. Keep checkout disabled until provider/webhook configuration and policy decisions are real; implement the auditable pricing/order/entitlement foundations and both product surfaces in slices.

Current implementation (2026-10-03): desktop and web publishers can publish free or paid immutable releases and manage listing terms for owned releases. User confirms Stripe platform test setup and selects platform collection followed by later author settlement. Checkout now creates a platform charge (separate charges and transfers): a publisher does not need an active Connect account for a buyer to purchase. Verified webhooks create exact-version entitlements and record publisher payable amounts against a publisher ID snapshotted on the order. The sales API exposes gross, platform fee, payable and outstanding totals. After the publisher completes Express onboarding, `/app/sales` offers an idempotent transfer request from the platform Stripe balance to the connected author account; Stripe's available platform balance can still make a transfer fail. The local test checkout/policy flags were already enabled by the user; local settlement uses separate transfers and 0% platform fee. Connect onboarding remains only a requirement to receive author transfers. Authenticated catalog entries suppress purchase for the owning publisher. Authenticated release details use a metadata-only endpoint; only the exact active entitlement permits downloading a paid bundle. Checkout return screens distinguish paid, pending, failed, expired and canceled attempts and allow rechecking a pending order. Refund/dispute processing, reversals, processor-fee/tax accounting and full transfer reconciliation remain open. A payable ledger is not a statement of Stripe available balance. Production Stripe, legal, tax and marketplace terms need review before launch. PHP lint, dashboard build and local commerce migration passed; no live payment/transfer or regression test suite was run.

The authenticated catalog marks exact releases with a paid order or active entitlement as already purchased. Checkout rechecks this under a release-row lock before creating an order, returns an already-owned response, and reuses an open pending Stripe Checkout Session to avoid duplicate orders; the buyer UI opens My purchases with an explanatory alert. Purchase cards use the historical amount/currency on each paid order instead of the release’s mutable current listing price. Repeated purchases of one exact artifact/version are grouped into one release card, while every payment remains individually visible with paid date, amount and order ID. Release details expose the server-projected Node ports/runtime/permissions or Flow Map/Workspace inventory preview, with description, publisher, license, release identity and checksum. `/app/purchases` is a dedicated signed-in dashboard route and sidebar item. A paid checkout return selects this view after status reconciliation. If the webhook has not arrived, the status endpoint retrieves the buyer-owned Stripe Checkout Session and, only when Stripe reports `complete` and `paid`, verifies its PaymentIntent, order/session identity, amount/currency and platform-collected charge before idempotently creating the paid order, exact-version entitlement and financial ledger entries. The anonymous public catalog initiates `/api/marketplace/checkout` directly for signed-in buyers, using the selected artifact/version and an idempotency key, then validates and follows the hosted Stripe URL. A 401 continues through the app sign-in purchase intent; visible inline status reports CSRF/API/Stripe errors without abandoning the public catalog. Laravel logs identified an empty optional Stripe product description as the cause of Checkout Session creation failure; the backend now omits that field for blank release descriptions, matching the working `audiolibroTools` pattern. A 503 clears the client idempotency key so a corrected retry is not trapped by the failed order. This wiring has not yet been end-to-end verified in an authenticated browser or against a test payment. The checkout server snapshots amount, currency and platform fee on the order and uses that snapshot for its hosted session. Checkout creates no Connect destination transfer. The webhook snapshots the publisher identity and creates a publisher payable ledger entry only after a verified payment. A payout request transfers the full positive outstanding balance for one currency, uses an idempotency key derived from the payable ledger, and records the Stripe transfer reference before responding. Stripe hosted URLs are validated in desktop and web clients. Buyer downloads require an active entitlement for the exact immutable release. Author payable is a service ledger, not a live Stripe balance; platform processing fees, taxes, refunds and disputes are not yet fully reconciled.

## Shared marketplace contract

- Listings identify artifact kind, immutable artifact/version, owner/publisher, title, description, license, visibility, price and currency, release checksum, provenance and lifecycle/review state.
- Free acquisition and paid purchase both return a server-authorized entitlement for an exact immutable release. The desktop verifies kind, version and checksum before presenting local installation/import review.
- Publication is a staged user action: prepare a complete preview, disclose exclusions/dependencies and pricing/visibility, then explicitly submit. New versions never overwrite prior releases.
- Catalog metadata is searchable and paginated. Private, unlisted and public access semantics are explicit and server-enforced.
- Marketplace trust, publisher identity, payment receipts and entitlements are distinct from local installation, node permission consent, activation and runtime execution.
- Preserve complete representable artifacts. Do not silently trim prompts, graph data, code, workspace records or package contents to satisfy undocumented service limits.
- Do not invent endpoints, payment providers, fees, taxes, currencies, licensing terms or moderation guarantees. Attribute and confirm these with the service owner before implementation.

## Per-family requirements

### Custom Node

Publish the exact hash-verified archive and manifest as an immutable release. Marketplace signatures/review status must be verifiable by Core. Downloaded archives enter the existing Custom Node archive inspection and explicit install path. Verified status never means permission consent or activation. Dependencies identify trusted Python packs and platform/runtime support.

Before installation, Core reports installed records with the same package identity and version. An identical archive hash is already installed and must remain visible in the review dialog without writing or closing it silently. A different archive hash under the same `id@version` requires an explicit “install as local copy” choice; it preserves the existing record and all Flow references, which remain bound to their exact archive hash.

### Flow Map

Reuse `tl-catalog-bundle/v1` graph closure and current credential/cache exclusions. Show Custom Node, Python and provider requirements before acquisition. Keep atomic import with fresh identities and paused execution.

### Workspace

Reuse `tl-catalog-bundle/v1` workspace closure and current import behavior. Make included assets, linked Flow Maps, AI definitions and omitted operational data clear in preview. Keep local identities isolated and execution paused.

## Existing implementation baseline

- Flow Map and Workspace already have authenticated free-form catalog publication, public/private/unlisted visibility, immutable versions, search/download and confirmed local import. This is a catalog foundation, not yet a commercial marketplace: no price, purchase, entitlement, payment, refund or settlement flow exists.
- Custom Nodes can be created/imported/exported locally but have no online marketplace API.
- The desktop account session and Core-owned catalog bridge are established foundations; preserve the Main/Core trust boundary and existing import lifecycles.
- Initial free Node catalog slice: the Laravel catalog accepts `node` as an artifact kind using `tl-custom-node-marketplace/v1` (manifest + base64 ZIP + SHA-256). Custom Nodes can prepare/publish an exact installed package version through Core, and the JSswift Catalog UI can browse/search/download Nodes; downloaded ZIPs are revalidated by Core and handed into the existing package review before installation. Permission grants and activation remain separate. No purchase/entitlement, paid listing, seller payouts, signed verified status, automatic updates or public-host deployment is implemented.

## Delivery phases

1. **Product/service decisions**: define publisher eligibility, free vs paid listing rules, currency/price model, payment provider and jurisdiction, fees/tax/refund/dispute policy, entitlement/download model, moderation and signature authority. Decide whether free releases can publish before payments launch. Record confirmed decisions; keep unknowns explicit.
2. **Unified service model**: extend typed artifact/release catalog for all three families; immutable manifests/checksums; purchase and entitlement records; owner authorization; visibility; idempotent payment webhooks; audit trail and abuse controls. Keep card/payment data out of Trackers Lens.
3. **Node marketplace**: upload/publish, catalog detail, free acquire or paid checkout, exact ZIP verification, then existing review/install/consent/activation.
4. **Flow Map and Workspace commerce**: adapt current publication browser to listing price and entitlement-aware acquire while preserving exact bundle review and paused import.
5. **Creator and buyer UX**: user listings/versions, draft preview, publish confirmation, purchase outcome/receipt, owned library and retryable download; clear free/paid distinctions and complete artifact dependencies.
6. **Verification and rollout**: service tests for ownership, price integrity, idempotency, entitlement and authorization; desktop tests for each kind; staging payment provider and webhook validation; deploy migrations/configuration only through the normal release process.

## Recommended business sequence

1. Launch **free artifact publication/acquisition first** for all three kinds. This validates discovery, immutable releases, creator identity, provenance and dependency review without taking payments or seller funds.
2. Keep **artifact sales** as a later, one-time purchase capability. An artifact entitlement grants a license/download of one exact version; it does not buy hosted execution, upgrades or support unless a separate product explicitly says so.
3. Treat **hosted execution/compute** as a separate product, billing ledger and consent. A Flow Map or Workspace can be free to download while its hosted runtime has its own plan/usage cost. Show resource class, expected billing unit, idle behavior, storage/egress terms and spend ceiling before deployment.
4. For compute, a Hugging Face-like shape is a useful starting hypothesis: an explicitly limited free tier that sleeps when idle, then paid persistent or higher-resource runtimes priced by measured active resource time. Begin with CPU only if unit economics and isolation support it; add GPU only after measured capacity/cost and abuse controls. Consider included monthly credits plus metered overage only if users can set hard spend limits and receive usage alerts. Do not announce specific prices or quotas until measured.
5. Build an internal cost model before publishing plans: runtime resource-seconds (CPU/RAM/GPU), persistent storage, data egress, build/start overhead, logs and model/provider pass-through. Meter at the service boundary using server-observed usage; never trust renderer-reported durations. Separate customer charge, provider cost, taxes, payment fees and TL margin in auditable records.

## Payments and tax recommendation (decision pending)

- Start with a **single launch region and currency set only after legal/accounting review**, rather than claiming global availability. Store money as integer minor units with ISO currency on every quote, purchase, refund and invoice; do not convert historical orders using current exchange rates.
- For **third-party seller payouts**, evaluate a marketplace product such as Stripe Connect first: its marketplace offering is designed for seller onboarding/KYC, payment routing, platform fees, payouts, refunds and disputes. This still requires selecting the charge model: with direct charges the seller can be merchant of record; with destination/separate charges the platform can be merchant of record. The choice changes contractual, tax and dispute responsibilities and must be reviewed before implementation. See [Stripe Connect marketplace](https://stripe.com/connect/marketplaces) and [Stripe charge models/MoR overview](https://stripe.com/resources/more/merchant-of-record).
- For **TL-owned subscriptions/compute services**, assess a Merchant of Record (MoR) option as a separate provider fit. A MoR can take on customer transaction, VAT/sales-tax collection/remittance and invoicing for supported software/digital sales; it does not automatically solve a multi-vendor marketplace where third-party creators receive revenue. Confirm the provider contract and product eligibility directly. Paddle describes its MoR model in [its tax guide](https://www.paddle.com/help/sell/tax/how-paddle-handles-vat-on-your-behalf).
- Do not collect or store card details. Use hosted checkout/onboarding and provider tokens. Keep provider webhook signatures, idempotency keys and a double-entry-style append-only financial ledger; reconcile orders, provider fees, taxes, refunds, disputes, seller balances and payouts.
- **Taxes are not one global setting.** Before paid EU consumer sales, get advice on TL’s seller/marketplace role for each digital artifact and hosted service, VAT place-of-supply/invoicing/OSS handling, seller information/reporting duties (including whether DAC7 applies), and records. The European Commission describes OSS/deemed-supplier cases and platform record-keeping in its [VAT OSS guidance](https://vat-one-stop-shop.ec.europa.eu/one-stop-shop_en) and [DAC7 guidance](https://taxation-customs.ec.europa.eu/taxation/tax-transparency-cooperation-and-mutual-assistance/administrative-co-operation-and-mutual-assistance/dac7_en). These sources do not determine TL’s precise treatment; obtain qualified Italian/EU tax advice.
- Publish refund rules by product type and jurisdiction before taking money. Support provider-mediated refunds and disputes, preserve immutable transaction evidence, and revoke/restrict entitlements only under clear rules. For compute, stop future usage on cancellation; explain treatment of already accrued charges and unused included credits.
- Proposed v1: free artifact catalog only; no creator payouts, paid checkout or compute billing. Proposed next paid pilot: TL-owned compute in one reviewed region/currency with explicit usage budgets. Add third-party artifact revenue sharing only after seller onboarding, tax/reporting, refunds, moderation and payout operations are ready. This is a product recommendation, not legal or tax advice.

## Hosted execution boundary (future product)

Remote execution is a new runtime, not a catalog feature. It needs a separate server runtime service and threat model: tenant-isolated jobs, authenticated per-workspace identity, sandboxed processors/Custom Nodes, secret handling, network egress policy, resource metering, cancellation, logs/data retention, backups and abuse response. The local Electron/TL Core runtime contract is not evidence that untrusted graph/package code is safe on a shared server. No uploaded Flow Map or Workspace should execute automatically after purchase/import or publication.

Maintain separate identifiers and state for `artifactRelease`, `purchaseEntitlement`, `hostedDeployment`, `computePlan`, `usageLedger` and `sellerPayout`. Marketplace purchases must not create a hosted deployment; deploying a free artifact must still require an explicit user action and compute-plan selection.

## Acceptance criteria

- A user can publish each supported artifact family as free or paid according to confirmed account/service rules.
- Another user can discover free items or complete a paid checkout and acquire only the exact entitled immutable version.
- Repeated requests/webhooks do not double-charge, duplicate entitlements or create conflicting releases.
- The client verifies artifact type, release identity and checksum before local review/import.
- Flow Map/Workspace imports remain isolated, paused and dependency-transparent; Custom Nodes retain review, permission and activation gates.
- Publisher revenue, platform fees, refunds and buyer entitlements are auditable; payment credentials are handled only by the payment provider.
- No UI claims payment/purchase is available until the live service and provider configuration are deployed and verified.

## Active questions

The implementation must resolve these with the user/service owner before paid checkout is built: supported countries/currencies; one-time vs subscription pricing; minimum/maximum price; platform fee and publisher payouts; tax/VAT merchant-of-record responsibility; refund/dispute policy; identity/KYC needs; payout provider; moderation/signature policy; and whether initial launch should ship free publishing/acquisition ahead of paid commerce.
