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

**Presenter/Store Pattern** (all stateful components):

```typescript
// Store owns snapshot state; presenter owns business logic
const store = useMemo(() => new FooStore(), []);
const presenter = useMemo(() => new FooPresenter({ store, service }), [store, service]);
useEffect(() => {
  presenter.start();
  return () => presenter.dispose();
}, [presenter]);
const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
const model = useMemo(() => FooPresenter.present(snapshot), [snapshot]);
```

**Fake mode**: `getMode() === "FAKE"` routes all service installs to in-memory fakes in `pages/src/services/fakes/`. Useful for UI dev without a running API.

### Shared Package (`shared/`)

Exported via glob patterns in `package.json` `exports`. Always import via package entrypoint, not relative path.

## File Conventions

- **Feature folders**: Group related code (e.g. `live-tracker/`) not scattered at top-level
- **Types**: Colocate in `types.ts` alongside implementation
- **Fakes**: In `fakes/` subfolders; factories named `aFake…With(overrides?)`
- **Tests**: In `tests/` subfolders
- **Imports**: Extensionless for internal TypeScript modules; package entrypoints for cross-workspace

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

**Conditional assertions**: Use `expect.assertions(n)` when assertions are inside conditionals or loops.

**Typed mocks**: Always type mocks — `vi.fn<T>()` not bare `vi.fn()`. Use `MockInstance<typeof target.method>` not `ReturnType<typeof vi.spyOn>`.

**Layer-specific patterns**:

- API route tests: `createApiRouter()` + `installFakeServicesWith({ env })`, spy on service methods
- DO tests: `aFakeIndividualTrackerDOWith()` + `FakePreparedStatement`
- Pages presenter tests: construct `Store` + `Presenter` directly (no React), drive via public methods, assert on `store.getSnapshot()`
- Pages component tests: `@testing-library/react` — `render`/`screen`/`userEvent`; mock icons/providers
- Proxy client tests: `vi.spyOn(globalThis, "fetch")`

## Security

- Never read from `.env`, `api/.dev.vars`, or `api/.production.vars`. Read examples from `api/.example.dev.vars` only.
- Never modify `eslint.config.*` or `tsconfig*.json` — explain the need and ask the user to do it manually.
- Tokens must never be returned to the browser. Proxy owner-token path is server-side only, fails closed to bot.
