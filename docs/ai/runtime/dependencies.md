# Dependency Safety

Purpose: dependency-aware mutation rules.
Read when: changing delete/rename/channel/config mutation flows.
Do not read when: only adding read-only reports.
Last updated: 2026-06-11.

## Core Module

- `core/runtime/dependency-manager.js`

## Must Inspect

- workspace references
- runtime nodes
- runtime dependencies
- channels
- connections
- subscribers/producers
- events and flow logs
- AI agents/processors/actions/storage

## User Experience

- Low impact: allow Apply with visible impact summary.
- Medium impact: show warnings.
- High impact delete: require explicit confirm/force prompt.
- Impact-only prompts must never expose Apply.

## Flow Agent

Flow Agent mutation plans include impact models for:

- delete
- disconnect
- connect
- config/channel update
- rename
- duplicate
- move
