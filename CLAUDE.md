# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

Guilty Spark is a Discord bot + web platform for Halo Infinite NeatQueue league tracking. It is a TypeScript monorepo with three npm workspaces:

- **`api/`** — Cloudflare Worker (Discord bot, REST API, Durable Objects)
- **`pages/`** — Astro 6 + React 19 website (streamer tools, viewer pages)
- **`shared/`** — Shared Zod contracts, types, and utilities

## Commands

### Development

```bash
npm start                  # Run both API and Pages dev servers concurrently
npm run start:api          # API only (wrangler dev)
npm run start:pages        # Pages only (astro dev)
```

### Testing

```bash
npm test                                    # All tests across all workspaces
npx vitest run <path>                       # Run a specific test file or directory
npx vitest run --reporter=verbose           # Verbose output
npm run test:coverage                       # Coverage report
```

Tests use three Vitest environments: `node` (api, shared) and `jsdom` (pages). Fake timers are active for `setTimeout`, `clearTimeout`, and `Date`.

### Type Checking & Linting

```bash
npm run typecheck            # Both api + pages
npm run typecheck:api        # API only (tsc --noEmit)
npm run typecheck:pages      # Pages only (astro check)
npm run lint                 # ESLint + Stylelint
npm run lint:fix             # Auto-fix lint issues
npm run format               # Check Prettier formatting
npm run format:fix           # Auto-format
npm run done                 # Full pipeline: format + typecheck + lint + test
```

### Building & Deploying

```bash
npm run build:api            # tsc build (api)
npm run build:pages          # astro build (pages)
npm run deploy:api           # wrangler deploy
npm run deploy:pages         # astro build + wrangler deploy
```

## Architecture

### API Worker (`api/`)

**Entry**: `worker.ts` exports the default fetch handler (wrapped in Sentry) and all Durable Object classes (`LiveTrackerDO`, `IndividualTrackerDO`).

**Router** (`server.ts`): Uses `itty-router` AutoRouter with CORS middleware. Routes are registered via named `RoutesRegisterHandler` functions:

```typescript
// api/routes/base/types.ts
export type RoutesRegisterHandler = (
  router: AutoRouterType,
  installServices: InstallServices,
) => void;

// Usage in server.ts
authRoutesRegisterHandler(router, installServices);
```

**Dependency Injection** (`services/install.ts`): All services are instantiated once per request via `installServices({ env })` and passed to route handlers. Services include `authService`, `databaseService`, `haloService`, `individualTrackerService`, etc. Tests inject fakes via `installFakeServicesWith`.

**Contracts** (`shared/src/contracts/`): Zod schemas wrapped with `defineContract()` which adds `parse`, `safeParse`, `fromResponse(response)`, and `toResponse(data, opts)` helpers. Contracts are used for both API input validation and response serialisation.

```typescript
export const getSettingsContract = defineContract(z.object({ settings: streamerViewSettingsSchema }));
// In route: return getSettingsContract.toResponse({ settings }, { noStore: true });
// In client: const data = await getSettingsContract.fromResponse(response);
```

**Durable Objects**: `LiveTrackerDO` and `IndividualTrackerDO` handle WebSocket hibernation, alarm-based polling, and state persistence. IDs are derived from `env.INDIVIDUAL_TRACKER_DO.idFromName(`${userId}:${trackerId}`)`.

**Database**: D1 (SQLite). All queries go through `DatabaseService` in `api/services/database/database.ts`. Schema in `api/services/database/schema.sql`. Row types in `api/services/database/types/`.

**Halo Proxy**: `GET /proxy/halo-infinite/:operation` — allowlisted, GET-only, edge-cached. Client-side code uses `createHaloInfiniteClientProxy` from `shared/src/halo/halo-infinite-client-proxy.ts`.

### Pages Site (`pages/`)

**Rendering**: Hybrid Astro — most pages are statically prerendered; dynamic routes (e.g. `/individual-tracker/[trackerId]`) use `export const prerender = false` with `client:only="react"`. The Cloudflare adapter produces a Worker + static assets. The `cockatiel` dependency requires a Vite alias fix in `astro.config.ts` to resolve its missing ESM barrel.

**App Islands**: Each feature area in `pages/src/apps/` has a `create.tsx` (React island entry) and `services.ts` (real vs fake service installation based on `getMode()`). The Astro page passes `apiHost={API_HOST}` down to the island.

**Presenter/Store Pattern** (all stateful components):

```typescript
// store holds snapshot + subscriber set
class FooStore {
  subscribe(listener: () => void): () => void { ... }
  getSnapshot(): FooSnapshot { ... }
}

// presenter holds business logic
class FooPresenter {
  static present(snapshot: FooSnapshot): FooViewModel { ... }
  start(): void { ... }
  dispose(): void { ... }
}

// island wires them together
const store = useMemo(() => new FooStore(), []);
const presenter = useMemo(() => new FooPresenter({ store, service }), [store, service]);
useEffect(() => { presenter.start(); return () => presenter.dispose(); }, [presenter]);
const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
const model = useMemo(() => FooPresenter.present(snapshot), [snapshot]);
```

The `useIndividualTrackerViewer` hook in `pages/src/components/individual-tracker/viewer/use-individual-tracker-viewer.ts` encapsulates this wiring and is reused by multiple pages.

**Styling**: CSS Modules only. Use `classnames` for conditional classes. Design tokens in `pages/src/styles/variables.css` (spacing, colours, fonts, breakpoints). No template-literal class strings. CSS variables are passed via typed `style={{ borderLeftColor: hex }}` (not CSS variable `as React.CSSProperties` casts).

**Fake mode**: `getMode() === "FAKE"` (set via `--mode fake` in Vite) routes all service installs to in-memory fakes in `pages/src/services/fakes/`. Useful for UI development without a running API.

### Shared Package (`shared/`)

Exported via `package.json` `exports` field using glob patterns (`"./contracts/*"`, `"./halo/*"`, etc.). Always use the package entrypoint in imports: `@guilty-spark/shared/contracts/individual-tracker/settings`.

## Key Conventions (from AGENTS.md)

**TypeScript**: No `any`, `unknown`, non-null `!`, or `as` casts in production code. Use `Preconditions.checkExists(value, "message")` instead of `!`. The only accepted exception is `as unknown as X` for test global stubs (e.g. `global.WebSocket = MockWebSocket as unknown as typeof WebSocket`).

**Exhaustive switches**: Every `switch` on a union type must have `default: throw new UnreachableError(value)` and curly braces on every case.

**Error types**: `EndUserError` for user-facing validation errors. System errors propagate to Sentry.

**Iteration**: `for...of` not `.forEach`.

**Imports**: Extensionless for internal modules (`import { Foo } from "./foo"` not `"./foo.ts"`).

**Tests — black-box only**: Mock only constructor-injected dependencies (services). Never mock internal implementation. Use `aFake…With(overrides)` factory functions from `fakes/` folders. Use `expect.assertions(n)` inside conditionals/async branches. Use `vi.fn<T>()` typed mocks and `MockInstance<typeof x>` for spy types.

**No comments** unless the WHY is non-obvious. No JSDoc. Tests document behaviour.

**CSS**: CSS Modules only, `classnames` for conditionals, no template-literal class strings.

## Environment Variables

Local development uses `api/.dev.vars` (never committed; see `api/.example.dev.vars`). Required vars include `DISCORD_APP_ID`, `MICROSOFT_CLIENT_ID/SECRET`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_SECRET`, `HALO_API_KEY`, `XBOX_CLIENT_ID/SECRET`, `HOST_URL`, `PAGES_URL`, `MODE`.

Never read from `.env`, `api/.dev.vars`, or `api/.production.vars` in code. Read examples from `api/.example.dev.vars` only.

## Testing Patterns

- **API route tests**: Mount the router with `createApiRouter()`, use `installFakeServicesWith({ env })`, spy on service methods.
- **DO tests**: Use `aFakeIndividualTrackerDOWith()` + `FakePreparedStatement`.
- **Pages presenter tests**: Construct `Store` + `Presenter` directly (no React), drive via public methods, assert on `store.getSnapshot()`.
- **Pages component tests**: `@testing-library/react` with `render`/`screen`/`userEvent`. Mock icons and external components that throw without a provider.
- **Proxy client tests**: `vi.spyOn(globalThis, "fetch")`.
