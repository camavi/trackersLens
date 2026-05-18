# Trackers Lens Runtime Architecture

Trackers Lens is now treated as a local AI Runtime Operating Environment, not as a simple widget dashboard or Chrome plugin.

The project must be developed as an event-driven, channel-based, dependency-aware runtime where every workspace component can have inputs, outputs, channels, subscribers, runtime mappings and active flows.

## Core Principle

Every runtime object must be safe to inspect before it is modified or removed.

Before deleting, renaming or changing any of these entities:

- boxTracker
- boxLens
- AI Agent
- Processor
- Connection
- Workspace
- Channel
- Runtime node

the implementation must check:

- linked channels
- active connections
- flow nodes
- subscribers
- event listeners
- dependent AI agents
- dependent actions
- workspace references
- runtime mappings
- active event streams

## Runtime Layers

The target execution model is:

```txt
Sources
  -> boxTracker
  -> Channels
  -> Processors
  -> AI Agents
  -> boxLens
  -> Actions
```

The visual workspace is not separate from this model. The Flow Map is the visible representation of the runtime graph behind each workspace.

## Main Modules

- Event Bus: publishes and dispatches runtime events.
- Channel Registry: owns channel definitions, producers and subscribers.
- Runtime Connections: persist source/output to target/input mappings.
- Runtime Graph: represents nodes, edges, dependencies and workspace ownership.
- Dependency Manager: validates destructive or breaking operations.
- Runtime Inspector: shows active nodes, linked channels, subscribers, logs and health.
- Event Logs: stores emitted, received, failed and replayed events.

## IndexedDB Stores

Target runtime stores:

- `tl_channels`
- `tl_connections`
- `tl_flows`
- `tl_events`
- `tl_flow_logs`
- `tl_agents`
- `tl_runtime_nodes`
- `tl_runtime_dependencies`

Existing stores such as `tl_widgets`, `tl_pages`, `tl_settings` and `tl_ai_*` remain part of the broader local runtime.

## Destructive Operations Contract

Runtime destructive operations must follow this sequence:

1. Resolve the entity type and stable id.
2. Load all workspace references.
3. Load all runtime graph nodes that reference the entity.
4. Load all channels where the entity is producer or subscriber.
5. Load all active connections touching the entity.
6. Load AI agents, processors and actions using those channels.
7. Return a dependency report.
8. Block normal deletion when dependencies exist.
9. Allow only explicit cancel, view dependencies or force delete.
10. When force deleting, update mappings, flows, subscribers and logs consistently.

## Dependency Warning Dialog

Required UX when dependencies exist:

Title:

```txt
Questo box e utilizzato nel runtime
```

Message:

```txt
Il boxTracker "<name>" e utilizzato da altri componenti del workspace.
```

The dialog must show:

- linked channels
- linked boxLens
- linked AI agents
- active connections
- affected workspaces

Actions:

- Cancel
- View Dependencies
- Force Delete

CMSwift components should be used for dialog, toolbar, buttons, grids and panels unless a custom canvas/runtime surface is required.
