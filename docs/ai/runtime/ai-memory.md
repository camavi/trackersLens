# AI Memory

Purpose: AI memory model and next step target.
Read when: implementing Step 5 or memory retrieval.
Do not read when: unrelated Flow Map work.
Last updated: 2026-06-11.

## Store

- `tl_ai_memory`

## Scopes

- `short`
- `workspace`
- `global`

## Existing API Direction

Use `TrackerLensAiRuntimeStore` for:

- remembering events/decisions
- listing memory
- building memory context
- cleanup/forget operations

## Step 5 Target

Memory should store confirmed facts:

- node aliases after rename
- user-selected endpoint candidates
- successful Apply outcomes
- recurring user preferences
- latest useful runtime error diagnosis

Memory should not store:

- unverified guesses
- failed endpoint suggestions as truth
- noisy transient logs unless summarized
