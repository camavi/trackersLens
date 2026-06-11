# Decisions

Purpose: important decisions that should guide future work.
Read when: a change might conflict with architecture or product direction.
Do not read when: making narrow UI/code fixes.
Last updated: 2026-06-11.

## Product

- Trackers Lens is a local AI Runtime Operating Environment.
- Runtime graph and event flow matter more than dashboard layout.
- Flow Map is the primary runtime graph surface.

## Runtime

- Runtime objects are workspace-scoped unless explicitly global.
- Global Library assets are not automatically Flow Map nodes.
- Runtime graph nodes/dependencies live in runtime stores.
- Channels are first-class runtime objects.

## Safety

- Mutations must use the Flow Agent tool registry and safe executor.
- Apply must revalidate each step against current runtime state.
- Time Travel snapshots should be captured before runtime writes.
- High-impact deletes require explicit confirmation.

## Endpoint Research

- The assistant must not invent endpoints.
- Research candidates must include source/verification context.
- Discovered endpoints are not written automatically.
- User must click/select a candidate or provide explicit URL before Apply.

## Documentation

- `AI.md` is the only mandatory markdown entrypoint.
- Do not recreate large monolithic files like the old `INFO_AI.md`.
- Prefer small module-specific markdown files with `Purpose`, `Read when`, `Do not read when`.
