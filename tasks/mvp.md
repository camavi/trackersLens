# Runtime MVP

The runtime MVP is the smallest version of Trackers Lens that proves the new architecture.

## MVP Goal

Trackers Lens must safely run a workspace where data flows from a source to tracker, channel, optional processor or AI agent, boxLens and action, while showing dependencies before destructive operations.

## MVP Scope

Included:

- real runtime stores
- channel registry
- dependency manager
- runtime-aware boxTracker delete flow
- base event logging
- base runtime inspector
- base Flow Map representation

Not included yet:

- marketplace verification
- full sandbox isolation
- full AI job execution engine
- Chromium runtime fork
- collaborative cloud sync
- package/version registry

## MVP Acceptance Criteria

- A boxTracker can publish at least one named channel.
- A boxLens can subscribe through a persisted runtime connection.
- A dependency report can show which workspace, connection and channel use a selected tracker.
- Deleting a used tracker shows a dependency warning and blocks normal delete.
- Force Delete is explicit and updates affected runtime mappings.
- Runtime Inspector can show selected node details and recent events.
- Existing `workspace.html`, `editorWorkspace.html`, `editorBoxTracker.html`, `editorBoxLens.html`, `library.html`, `connections.html`, `analytics.html`, `ai.html` and `settings.html` still load.

## First Demo Scenario

```txt
Binance WebSocket
  -> BTC Price Tracker
  -> btc.price
  -> BTC Price Lens
  -> AI Market Analyzer
  -> Alert Agent
```

When the user attempts to delete `BTC Price Tracker`, Trackers Lens must show the Dependency Warning Dialog with all linked runtime objects.
