# AGENTS.md

Guidance for all AI agents working in this repository. Read this file in full before writing any code.

## Repository Overview

Guilty Spark is a Discord bot + web platform for Halo Infinite NeatQueue league tracking. TypeScript monorepo with three npm workspaces:

- **`api/`** — Cloudflare Worker (Discord bot, REST API, Durable Objects)
- **`pages/`** — Astro 6 + React 19 website (streamer tools, viewer pages)
- **`shared/`** — Shared Zod contracts, types, and utilities

## Commands

```bash
# Development
npm start                   # Both API and Pages dev servers
npm run start:api           # API only (wrangler dev)
npm run start:pages         # Pages only (astro dev)

# Testing
npm test                    # All workspaces
npx vitest run <path>       # Single file or directory
npm run test:coverage       # Coverage report

# Quality
npm run typecheck           # Both api + pages
npm run typecheck:api       # API only (tsc --noEmit)
npm run typecheck:pages     # Pages only (astro check)
npm run lint                # ESLint + Stylelint
npm run lint:fix            # Auto-fix lint issues
npm run format:fix          # Auto-format (Prettier)
npm run done                # Full pipeline: format + typecheck + lint + test

# Build & Deploy
npm run build:api           # tsc build
npm run build:pages         # astro build
npm run deploy:api          # wrangler deploy
npm run deploy:pages        # astro build + wrangler deploy
```

## Architecture

### API Worker (`api/`)

**Entry**: `worker.ts` exports the default fetch handler (Sentry-wrapped) and all Durable Object classes.

**Router** (`server.ts`): `itty-router` AutoRouter with CORS. Routes are registered via named `RoutesRegisterHandler` functions and called in `server.ts`:

```typescript
export type RoutesRegisterHandler = (router: AutoRouterType, installServices: InstallServices) => void;
// In server.ts: authRoutesRegisterHandler(router, installServices);
```

**Dependency Injection** (`services/install.ts`): All services are instantiated once per request via `installServices({ env })`. Tests inject fakes via `installFakeServicesWith`. Services include `authService`, `databaseService`, `haloService`, `individualTrackerService`, etc.

**Contracts** (`shared/src/contracts/`): Zod schemas wrapped with `defineContract()` which adds `parse`, `safeParse`, `fromResponse(response)`, and `toResponse(data, opts)`. Always use the shared package entrypoint: `@guilty-spark/shared/contracts/individual-tracker/settings`.

```typescript
export const settingsContract = defineContract(z.object({ settings: streamerViewSettingsSchema }));
// Route:  return settingsContract.toResponse({ settings }, { noStore: true });
// Client: const data = await settingsContract.fromResponse(response);
```

**Durable Objects**: `IndividualTrackerDO` handles WebSocket hibernation, alarm-based polling, and state persistence. IDs via `env.INDIVIDUAL_TRACKER_DO.idFromName(`${userId}:${trackerId}`)`.

**Database**: D1 (SQLite) via `DatabaseService`. Schema in `api/services/database/schema.sql`. Row types in `api/services/database/types/`.

**Halo Proxy**: `GET /proxy/halo-infinite/:operation` — allowlisted, GET-only, edge-cached. Client uses `createHaloInfiniteClientProxy` from `shared/src/halo/halo-infinite-client-proxy.ts`.

### Pages Site (`pages/`)

**Rendering**: Hybrid Astro — most pages statically prerendered; dynamic routes use `export const prerender = false` with `client:only="react"`. The `cockatiel` dep requires a Vite alias in `astro.config.ts` (its ESM barrel doesn't ship).

**App Islands**: Each feature in `pages/src/apps/` has `create.tsx` (React island entry) and `services.ts` (real vs fake via `getMode()`). Astro page passes `apiHost={API_HOST}` to the island.

**Create Entry Point Guardrails (required)**:

- Every `pages/src/components/**/create.tsx` module must export a `create*` factory API (for example `createFooSection`, `createBarPage`) rather than exporting a direct wiring component.
- A create factory may close over stable dependency config (services, environment adapters, static options), then return a renderable component.
- Disposable runtime collaborators (stores, presenters, controllers, subscriptions) must be mount-scoped inside the returned component (for example via `useMemo`/`useEffect` in that component), never factory-scoped singletons.
- Consumers should instantiate factory-returned components once per mount boundary (typically with `useMemo(() => createX(config), [configDeps])`) and render the returned component.
- Tests must avoid shared factory-created state across test cases. Instantiate returned components per test (or in `beforeEach`) instead of sharing one component instance at `describe` scope.
- For migrations and reviews, treat these as required checks: factory API shape, remount safety, and focused regression coverage for lifecycle-sensitive paths.

**Presenter/Store Pattern** (all stateful components):

Each feature follows the SPC split: Store → Presenter → Component (view).

- **Store**: pure state holder — no fetching, no business logic. Exposes `getSnapshot()` and `subscribe(listener)`. Only mutated by the presenter via `store.update(patch)`.
- **Presenter**: owns all business logic and async work. `start()` drives fetches and pushes results to the store. `present(snapshot)` is a pure computation that converts a snapshot into a fully display-ready view model — all formatting, icon URLs, hex colour values, sorted arrays, and computed strings must be done here, not in the view.
- **View (component)**: pure renderer. Receives specific named props only (see **View Props** below). No business logic, no utility calls, no `useMemo` for data derivation.

**Presenter shape and ownership**:

- Presenters should be class-based by default (for example, `FooPresenter`) rather than modules that expose many independent exported functions.
- Front-load shared setup in the presenter constructor (defaults, static mappings, reusable options) so call sites remain thin and consistent.
- Keep presenter public API small and intentional (for example, `present(...)` and a few UI state helpers), with helper logic implemented as private methods.
- `create.tsx` owns presenter instantiation (`useMemo(() => new FooPresenter(...), [...])`) and orchestrates calls; components remain render-only.
- Do not move business/data-shaping logic into components to satisfy short-term convenience. If logic is shared by multiple presenter methods, extract private presenter methods first.

```typescript
// create.tsx — wires the three layers together
const store = useMemo(() => new FooStore(), []);
const presenter = useMemo(() => new FooPresenter({ store, service }), [store, service]);
useEffect(() => {
  presenter.start();
  return () => presenter.dispose();
}, [presenter]);
const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
const model = useMemo(() => presenter.present(snapshot), [presenter, snapshot]);
return <FooView {...model} />;
```

**View Props**: Views must receive specific named props — never a generic `model` object or raw contract types (e.g. `renderData: Contract["renderData"]`). The `create.tsx` file is the mapping layer between presenter output and view props; spreading the model is idiomatic: `<FooView {...model} />`. `useMemo` inside a view is acceptable only for pure view-layer derivations such as column definitions — never for business logic or data transformation.

When a feature needs view-model computation beyond simple pass-through, prefer presenter methods invoked from `create.tsx` over ad hoc utility calls in the component.

**Shared types between presenter and view**: If a type is used by both the presenter and the view, it lives in `types.ts` in the same folder. The presenter does not import from the view; the view does not import from the presenter. Both import from `types.ts`.

**Fake mode**: `getMode() === "FAKE"` routes all service installs to in-memory fakes in `pages/src/services/fakes/`. Useful for UI dev without a running API.

### Shared Package (`shared/`)

Exported via glob patterns in `package.json` `exports`. Always import via package entrypoint, not relative path.

## File Conventions

- **Feature folders**: Group related code (e.g. `live-tracker/`) not scattered at top-level
- **Types**: Colocate in `types.ts` alongside implementation. Shared types between a presenter and its view belong in `types.ts` in the same folder — neither file imports from the other (see **Shared types** under Presenter/Store Pattern above)
- **Fakes**: In `fakes/` subfolders; factories named `aFake…With(overrides?)`
- **Tests**: In `tests/` subfolders
- **Imports**: Extensionless for internal TypeScript modules; package entrypoints for cross-workspace
- **One key component per file**: If a file gains a non-trivial sub-component, move that sub-component to its own sibling folder (e.g. `match-card/`) with its own `tests/` subfolder
- **Sub-component ordering**: When multiple components share a file, sub-components must be defined before the parent component that uses them (ESLint `no-use-before-define`)
- **View file naming**: View component files are named `<component-name>.tsx` — no `-view` suffix. The file name matches the exported component name.
- **No re-exports**: Consumers import directly from the source module; never re-export a symbol from an intermediary wrapper file
- **Extract service helpers**: Helper functions that grow a service file belong in their own named files with dedicated tests

## Code Style

**TypeScript**: Strict mode. No `any`, `unknown`, non-null `!`, or `as` casts in production code. Use `Preconditions.checkExists(value, "message")` instead of `!`. The only accepted exception is `as unknown as X` for test global stubs (e.g. `global.WebSocket = MockWebSocket as unknown as typeof WebSocket`).

**Exhaustive switches**: Every `switch` on a union type must include curly braces on every case and `default: throw new UnreachableError(value)`:

```typescript
switch (item.type) {
  case "match": { ... break; }
  case "series": { ... break; }
  default: { throw new UnreachableError(item); }
}
```

**Errors**: `EndUserError` for user-facing validation errors. System errors propagate to Sentry.

**Loops**: `for...of`, never `.forEach`.

**Dates**: `date-fns` for all date operations.

**Imports**: Extensionless for internal modules. `import type` for type-only imports.

**Props ordering**: In React component interfaces, declare props in this order: data props (required first, then optional), then callback props (required first, then optional). Align destructuring order with the declaration order.

**Functions**: Functions to be single single responsibility, when needing to do multiple things, break it down into individual functions that are called / chained.

**Comments & Readability**: Comments exist on a spectrum. Apply this hierarchy before adding a comment:

1. **Extract to a named function** — If a comment explains what a block of code does, extract that block into a method with a descriptive name (e.g., `getMatchesToProcessBeforeMarker()` instead of `// Determine which matches to process`). Function names should describe intent; the function body handles the "how". Aim for functions 5-20 lines that fit one concept.
2. **Rely on test coverage** — If obscure logic exists, comprehensive tests with descriptive names often explain intent better than inline comments (e.g., `it("processes no matches when marker is found at index 0")` documents an edge case). Test names read like specifications.
3. **Keep comments only for truly obscure logic** — If code appears to do something unexpected (e.g., intentional off-by-one math, platform-specific workarounds, or non-obvious API contracts), add a brief comment explaining why. Example: `// malformed JSON — treat as empty slots`.

## Async Patterns

**Fire-and-forget calls**: always extract to a named async function — never chain `.then().catch()` for side-effectful work. Call with `void` to communicate intent.

**Presenters** — extract to a `private async` method named `<publicMethod>Async`:

```typescript
public loadMatches(): void {
  void this.loadMatchesAsync();
}

private async loadMatchesAsync(): Promise<void> {
  try {
    const result = await this.config.service.fetchSomething();
    if (this.isDisposed) { return; }
    this.config.store.batchUpdate({ data: result });
  } catch (err: unknown) {
    if (this.isDisposed) { return; }
    this.config.store.batchUpdate({ error: "Failed" });
  }
}
```

**Hooks/effects** — extract to a named inner async function:

```typescript
useEffect(() => {
  let isCancelled = false;

  async function fetchDirectory(): Promise<void> {
    try {
      const dir = await service.getDirectory(gamertag);
      if (isCancelled) {
        return;
      }
      setDirectory(dir);
    } catch {
      if (isCancelled) {
        return;
      }
      setError(true);
    }
  }

  void fetchDirectory();

  return (): void => {
    isCancelled = true;
  };
}, [deps]);
```

**`void` usage**: marks intentional fire-and-forget calls — not a linter silencer for unintentional floating promises. The `@typescript-eslint/no-floating-promises` rule is enabled.

**Exception**: transformation chains that return a value (e.g. passed to `Promise.all`) are fine as-is.

## CSS / Styling

CSS Modules only — all styling via `.module.css`. Use `classnames` package for conditional classes; never template-literal class strings. Pass dynamic values via CSS variables in the `style` prop: `style={{ "--accent": color }}` (only acceptable `style` usage).

Media queries use PostCSS custom media from `pages/src/styles/variables.css`:

- `@media (--tablet-viewport)` — min-width: 750px
- `@media (--desktop-viewport)` — min-width: 1000px
- `@media (--ultrawide-viewport)` — min-width: 1200px

Never use `max-width` queries. Base styles are mobile-first.

## Testing

**Runner**: Vitest only (`npm test`). Three environments: `node` (api, shared), `jsdom` (pages).

**Structure**: `describe` / `it` blocks. Factual present-tense descriptions ("returns X when Y", not "should return X").

**Black-box**: Test inputs/outputs only. Mock only constructor-injected dependencies (services), never internal methods. Use `vi.spyOn` over `vi.mock` where possible.

**Data**: Use `aFake…With(overrides?)` factory functions from `fakes/` folders.

Prefer typed fake instances plus `vi.spyOn` over ad hoc test doubles. Avoid `as unknown as` and inline object literals for service dependencies; if a typed fake helper does not exist, add one under the relevant `fakes/` folder and use that instead.

**Conditional assertions**: Use `expect.assertions(n)` when assertions are inside conditionals or loops.

**Typed mocks**: Always type mocks — `vi.fn<T>()` not bare `vi.fn()`. Use `MockInstance<typeof target.method>` not `ReturnType<typeof vi.spyOn>`.

**Layer-specific patterns**:

- API route tests: `createApiRouter()` + `installFakeServicesWith({ env })`, spy on service methods
- DO tests: `aFakeIndividualTrackerDOWith()` + `FakePreparedStatement`
- Pages presenter tests: construct `Store` + `Presenter` directly (no React), drive via public methods, assert on `store.getSnapshot()`
- Pages component tests: `@testing-library/react` — `render`/`screen`/`userEvent`; mock icons/providers
- Proxy client tests: `vi.spyOn(globalThis, "fetch")`

**Post-review hardening expectations**:

- If a code review uncovers a regression risk, add a focused regression test in the same PR before merge.
- For list/detail mapping, prefer stable identifiers over positional assumptions (for example, team IDs over array order).
- For memoized components (`React.memo`), comparators must include all render-affecting props.
- Normalize display-boundary values in presenter/create layers (for example, treat empty subtitle values as absent) instead of encoding that logic in view rendering.

## Security

- Never read from `.env`, `api/.dev.vars`, or `api/.production.vars`. Read examples from `api/.example.dev.vars` only.
- Never modify `eslint.config.*` or `tsconfig*.json` — explain the need and ask the user to do it manually.
- Tokens must never be returned to the browser. Proxy owner-token path is server-side only, fails closed to bot.

## Feature development loop

1. Understand the requirements in full, ask prompter for clarification when uncertain.
2. Aim for pull requests to be 300 lines, with a hard limit at 500. If larger, work with prompter to break down the feature.
3. If set of requirements exceeds 3 pull requests, create a plan document but do not check it in. Ensure this plan records all decisions that may be discussed throughout any conversing with the prompter.
4. If working with a plan, prompt on whether to work as a single agent, or an orchestrator delegating possible parallelized tasks with the main agent taking on the responsibilities of ensuring adherence to this file
5. Building a feature:
   1. Ensure all work starts on a new branch, never commit or push to main
   2. Follow nearest neighbor approach in terms of software engineering patterns, practices, and architecture
   3. When feature is deemed "complete", commit the change
   4. If `/code-review` is available, put yourself (or a subagent) into a loop of doing "/code-review" and fixing issues that are identified until clean. Commit each iteration.
   5. Run format + lint + typecheck + test ensuring all pass and commit any outstanding issues.
6. If instructed by prompter, raise PR using `gh` with 3 sections
   1. Context - describe the overarching feature (summary of the plan if it is from a plan)
   2. This change - what does this PR do in context of the overall plan
   3. [Optional] Subsequent work - dot point summary of work to happen after this
7. Provide summary of changes, link to pull request, suggest to kick off copilot loop
8. If work is based on a plan, update the plan with the progress, and prompt for next action.
