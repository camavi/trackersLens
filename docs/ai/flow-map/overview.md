# Flow Map Overview

Purpose: explain Flow Map role.
Read when: working on `flowMap.html`, `js/flowMapView.js` or `js/flow-map/*`.
Do not read when: working outside Flow Map.
Last updated: 2026-06-11.

## Role

Flow Map is the runtime graph UI for a workspace.
It visualizes nodes, edges, channels, runtime state, events and logs.

## Node Types

- Sources
- Trackers
- Processors
- AI Agents
- Lens
- Actions
- Storage
- Dev/Preview

## Runtime Rule

A node appears in Flow Map only when materialized in the workspace runtime graph.
Do not auto-display every global library asset as a runtime node.

## UI Rule

Use CMSwift for shell, dialogs, toolbars and inspectors.
Use custom graph rendering for canvas, nodes, ports and links.
