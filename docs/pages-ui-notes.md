# Pages UI Notes (Live Tracker)

## Current State

- Pages uses Astro + CSS Modules everywhere.
- React integration is enabled via `@astrojs/react`.
- `/tracker` page mounts a React island.

## Goals

1. Build a React UI for the Live Tracker page that mirrors the Discord embed UX.
2. Make development and testing deterministic by introducing a Pages `src/services/` layer with fakes.
3. Keep API ↔ Pages contracts aligned via shared TypeScript-only "contracts".
4. Add testing layers:
   - Unit tests for React components
   - Unit test for page wiring (black-box)
   - Playwright tests for browser interactions

## Planned Architecture

### Shared Contracts

- Location: `contracts/src/*`
- Purpose: shared discriminated-union message types and domain types.
- Principle: treat these like protobuf IDL, but TypeScript-only.

### Pages Services

- Location: `pages/src/services/*`
- `install.ts` selects REAL vs FAKE based on `import.meta.env.MODE`.
- `live-tracker` service is responsible for connection management and streaming events to consumers.

### Fake Mode Expectations

- Should simulate a stream of messages deterministically.
- Should support deterministic scheduling in tests (fake timers or explicit tick/step).

## WebSocket “Deltas” Consideration

- Current: server sends full state snapshots.
- Potential future: `snapshot` on connect + `delta` updates.
- Recommendation: defer until UI is stable and we can measure payload frequency/size.
- If needed, introduce a message union like:
  - `{ type: 'snapshot', data: ... }`
  - `{ type: 'delta', data: ... }` (e.g. JSON Patch)
  - `{ type: 'stopped' }`

## Next Steps

1. Implement Pages `live-tracker` service (real + fake) and refactor tracker UI to consume it.
2. Add unit testing setup to Pages (Vitest + Testing Library) and a small first test.
3. Add Playwright test that runs the FAKE mode and checks basic interactions.
