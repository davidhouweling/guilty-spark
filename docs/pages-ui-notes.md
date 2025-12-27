# Pages UI Notes (Live Tracker)

## Current State

- Pages uses Astro + CSS Modules everywhere.
- React integration is enabled via `@astrojs/react`.
- `/tracker` page mounts a React island.
- Pages has a Services layer (`pages/src/services/`) with REAL vs FAKE selected by `import.meta.env.MODE` (supports `--mode=fake`).
- Live Tracker contracts + runtime parsing live in `contracts/` and are shared by API + Pages.

## Goals

1. Build a React UI for the Live Tracker page that mirrors the Discord embed UX.
2. Make development and testing deterministic by introducing a Pages `src/services/` layer with fakes.
3. Keep API ↔ Pages contracts aligned via shared TypeScript-only "contracts".
4. Add testing layers:
   - Unit tests for React components
   - Unit test for page wiring (black-box)
   - Playwright tests for browser interactions

## Progress (Checklist)

- [x] Pages uses Astro + CSS Modules everywhere.
- [x] React integration enabled via `@astrojs/react`.
- [x] `/tracker` mounts a React island.
- [x] Add shared contracts package (`contracts/`) with Live Tracker types.
- [x] Add shared runtime parsing for Live Tracker messages (no Zod; typed readers/parsers).
- [x] Add Pages Services layer with REAL vs FAKE (`pages/src/services/install.ts`, `import.meta.env.MODE`).
- [x] Implement Live Tracker service:
  - [x] REAL WebSocket connection (`pages/src/services/live-tracker/live-tracker.ts`).
  - [x] FAKE deterministic stream with manual stepping for tests (`pages/src/services/live-tracker/fakes/*`).
- [x] Add unit tests:
  - [x] Fake service deterministic behavior (`pages/src/services/live-tracker/fakes/tests/live-tracker.fake.test.ts`).
  - [x] React component test for the tracker island factory (`pages/src/components/live-tracker/tests/tracker-websocket-demo.test.tsx`).
  - [x] Unit test for state view-model transformation (`pages/src/components/live-tracker/tests/state-render-model.test.ts`).
- [x] Repository conventions:
  - [x] Co-locate component CSS modules with components.
  - [x] Keep page CSS near pages without breaking routing (use `pages/src/pages/_styles/`).
  - [x] Rename `pages/src/components/react` → `pages/src/components/live-tracker`.

## Planned Architecture

### Shared Contracts

- Location: `contracts/src/*`
- Purpose: shared discriminated-union message types and domain types.
- Principle: treat these like protobuf IDL, but TypeScript-only.

Status:

- Live tracker types: `contracts/src/live-tracker/types.mts`
- Live tracker parsing: `contracts/src/live-tracker/parse.mts`
- Sample state fixture: `contracts/src/live-tracker/fakes/data.mts`

### Pages Services

- Location: `pages/src/services/*`
- `install.ts` selects REAL vs FAKE based on `import.meta.env.MODE`.
- `live-tracker` service is responsible for connection management and streaming events to consumers.

Status:

- `pages/src/services/install.ts` selects REAL vs FAKE.
- `pages/src/services/live-tracker/live-tracker.ts` implements REAL WS connectivity.
- `pages/src/services/live-tracker/fakes/*` implements FAKE deterministic scenarios.

### Fake Mode Expectations

- Should simulate a stream of messages deterministically.
- Should support deterministic scheduling in tests (fake timers or explicit tick/step).

Status:

- Implemented (supports both `interval` and `manual` stepping modes).

## WebSocket “Deltas” Consideration

- Current: server sends full state snapshots.
- Potential future: `snapshot` on connect + `delta` updates.
- Recommendation: defer until UI is stable and we can measure payload frequency/size.
- If needed, introduce a message union like:
  - `{ type: 'snapshot', data: ... }`
  - `{ type: 'delta', data: ... }` (e.g. JSON Patch)
  - `{ type: 'stopped' }`

## Next Steps

1. Replace the current `/tracker` island (raw JSON “demo”) with a real Live Tracker UI that mirrors the Discord embed UX.

- Focus first on rendering the “state” snapshot clearly (teams, players, discovered matches), then handle `stopped`.
- Keep all parsing/typing via `@guilty-spark/contracts` (no ad-hoc JSON parsing in UI).

2. Introduce a typed view-model layer for UI rendering.

- Input: `LiveTrackerStateMessage`
- Output: a small “render model” for the UI (grouped by team, computed labels, stable ordering).
- Add unit tests for this transformation (deterministic; no DOM needed).

3. Add a black-box “page wiring” test.

- Assert that `/tracker` uses the services installer and renders the UI given FAKE mode.

4. Add Playwright coverage for basic flows.

- Run in FAKE mode.
- Validate: initial connect, state rendering, stop handling.

5. Cleanup (as we stabilize the UI):

- Delete the old integration scaffolding (e.g., `pages/src/components/live-tracker/react-integration-check.tsx`) once it’s no longer useful.

## Notes

- Fake mode dev server: run `npm start -- --mode=fake` from the `pages/` folder.
- Tests should render `TrackerWebSocketDemoFactory` directly and inject `services` rather than stubbing install logic in React.
