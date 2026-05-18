# Channel System

Channels are the backbone of the Trackers Lens runtime.

Runtime event publication and delivery are defined in:

```txt
docs/event-bus.md
```

A channel is a named data stream that decouples producers from consumers.

Example:

```txt
btc.price
btc.volume
btc.change24h
news.crypto
ai.market.analysis
alerts.price
```

## Producer and Subscriber Model

One producer can publish to a channel. Many subscribers can listen to it.

Example:

```txt
btc.price
  -> BTC Price Lens
  -> AI Market Analyzer
  -> Alert Agent
```

## Target Channel Record

```js
{
  id: "channel_btc_price",
  workspaceId: "workspace_crypto",
  name: "btc.price",
  label: "BTC Price",
  type: "number",
  producerNodeId: "tracker_binance_btc",
  producerOutput: "price",
  subscribers: [
    "lens_btc_card",
    "agent_market_analyzer"
  ],
  status: "active",
  lastValue: null,
  lastEmittedAt: null,
  createdAt: Date.now(),
  updatedAt: Date.now()
}
```

## Naming Rules

- Use lowercase dot notation.
- Prefer domain-oriented names: `btc.price`, `news.crypto`, `ai.summary`.
- Avoid UI-specific names such as `cardValue`.
- Do not rename active channels without dependency validation.
- Do not delete channels with active subscribers unless the user explicitly force deletes.

## Channel Registry Responsibilities

The Channel Registry must:

- create channels from tracker outputs
- resolve producers and subscribers
- prevent duplicate conflicting channels in the same workspace
- track last emission metadata
- expose dependency reports for deletion and rename operations
- update Flow Map node labels and links

## Current Implementation

First-pass implementation lives in:

```txt
core/runtime/channel-registry.js
```

Current behavior:

- `saveTracker()` registers or updates a global channel for the tracker output.
- `persistWorkspaceSilently()` syncs workspace channels and subscribers from box connections.
- Runtime dependency records are written for workspace connections.

Pending behavior:

- channel rename validation
- channel delete validation
- dedicated channel inspector UI
- retention and health metrics
