# AGENTS.md

## Project Overview

Discord bot built on Cloudflare Workers with Node.js ESM support. The bot provides Halo Infinite statistics, live match tracking, and strong integration with NeatQueue for Halo custom games.

**Tech Stack**: TypeScript, Cloudflare Workers, D1 Database, Durable Objects, Discord API

**Monorepo Structure**:

- `api/` - Discord bot Cloudflare Worker
- `pages/` - Cloudflare Pages website
- `contracts/` - Shared types and contracts between workspaces

## Setup Commands

```bash
# Install dependencies
npm install

# Start development server
npm start

# Deploy commands to Discord
npm run register

# Run tests
npm test

# Type checking
npm run typecheck

# Linting and formatting
npm run lint:fix
npm run format:fix
```

## Project Architecture

**Core Services**:

- `api/worker.ts` - Main Cloudflare Worker entry point
- `api/server.ts` - Request routing and dependency injection
- `api/services/install.ts` - Service configuration and wiring
- `api/commands/` - Discord slash commands and interactions
- `api/durable-objects/` - Persistent state management for live tracking

**Key Commands**:

- `/connect` - Link Discord to Xbox gamertag
- `/stats` - Show Halo Infinite match statistics
- `/maps` - Generate maps for custom games
- `/track` - Live match tracking with real-time updates

## File Structure & Conventions

- `api/` - Discord bot and public api endpoint; `pages/` - Website (Astro); `contracts/` - Shared types
- Tests in `tests/` folders, fakes in `fakes/` folders
- Use extensionless imports for internal TypeScript modules
- **Feature folders**: Group related code (e.g. `live-tracker/`) not scattered at top level
- **Types**: Colocate in `types.ts` files with implementation; `types.ts` must contain only interfaces and type aliases — no functions, classes, or runtime code
  - json casting: do not do `response.json() as ...`, instead do `response.json<...>()`
- **Fakes**: `<feature>/fakes/data.ts` for fixtures, separate files for behavior
- **Imports**: Prefer package entrypoints (e.g. `@guilty-spark/contracts/live-tracker/types`)
- **Astro**: Import components directly; avoid `.astro` barrels; consolidate in subfolders
- **Routes**: when adding routes to `api/server`, ensure to add it to `api/wrangler.jsonc`

## Pages Architecture (React Frontend)

The pages project follows a strict three-layer architecture. Each layer has a single, narrow responsibility.

### Layers

```
pages/src/pages/      ← Astro route adapters (no logic — imports and mounts an app)
pages/src/apps/       ← App bootstrap (service wiring, auth, loading gates)
pages/src/components/ ← Feature UI (presenter/store/view per feature)
```

**Route adapter** (`pages/*.astro`): No logic. Renders a single app component from `apps/`.

**App** (`apps/*.tsx`): Installs services, gates on auth/loading, constructs presenter and store, and passes the resulting component tree to the view. `BaseApp` handles the service-loading lifecycle; feature apps extend it. One app per route.

**Component** (`components/<feature>/`): Pure UI and local state. No direct service calls. Receives props and callbacks only.

### Presenter / Store Pattern

Each feature that needs state uses:

- `<feature>-store.ts` — state container only: holds the snapshot object and a subscriber set. No logic.
- `<feature>-presenter.ts` — all orchestration: reads/writes to the store, calls services, triggers side effects.
- `<feature>.tsx` — view: subscribes via `useSyncExternalStore`, renders from snapshot.

The view is a pure function of snapshot + callbacks. It contains no business logic.

### Section / Sub-component Factories (`create.tsx`)

A `create.tsx` file is only justified when a section needs its own presenter/store, or when it must wire child components to be passed into a parent. Do not create a `create.tsx` just to wrap a single stateless component.

When a feature section is self-contained with its own state (e.g. `live-trackers/`), expose a **controller interface** rather than the presenter class directly. The parent receives the interface and a pre-wired `Component`; it does not import the child's presenter.

```ts
// create.tsx returns:
{ controller: LiveTrackersController, Component: () => React.ReactElement }
```

The controller interface lives in `types.ts`, not in `create.tsx`.

### Component Hierarchy and Duplication

- Sub-components are the right place to start. Keep them co-located inside their feature folder.
- When a sub-component needs to be shared by two features, lift it to a shared `components/` folder at the appropriate level — don't duplicate it.
- If the same UI pattern appears more than once, extract a shared component rather than copying markup.
- Prefer extending existing shared components (`Alert`, `Container`, `ErrorState`, `LoadingState`) over creating new ones for the same purpose.

### Alert Component

Use `Alert` for all user-facing error, warning, and informational messages. Do not write bespoke error/info styled divs. `Alert` accepts a `variant` (`error` | `warning` | `info`) and optional `icon`.

### CSS Co-location

- Every component has its own `.module.css` file in the same folder.
- Do not put component styles in a shared or parent CSS file.
- If a style is only used by one component, it belongs in that component's module.
- Only use the `style` attribute to pass a value through a CSS variable; all other styling goes in the CSS module.

## Code Style

- **TypeScript**: Strict mode, explicit types, no `any`/`unknown`/`!`; use `Preconditions.checkExists()` for null safety
- **Imports**: Prefer extensionless imports for internal TypeScript modules
- **Loops**: Prefer `for...of` over `forEach`
- **Switch**: wrap all cases with curly brackets
- **Errors**: Use `EndUserError` for user-facing errors
- **Dates**: Use `date-fns` for operations; `react-time-ago` (relative) or `Date.toLocaleString()` (absolute) for display
- **Rendering**: Data-driven patterns with typed arrays; preserve ARIA attributes

## CSS/Styling (Pages Project)

- **Mobile-First**: Base styles for mobile, progressively enhance for larger screens
- **Media Queries**: Use PostCSS custom media from `pages/src/styles/variables.css`:
  - `@media (--mobile-viewport)` - max-width: 749.9px (rarely needed)
  - `@media (--tablet-viewport)` - min-width: 750px
  - `@media (--desktop-viewport)` - min-width: 1000px
  - `@media (--ultrawide-viewport)` - min-width: 1200px
- **Organization**: Group media queries at bottom with section headers; never use `max-width` queries
- **Design Tokens**: Use `pages/src/styles/variables.css` tokens (e.g. font size, spacing, colors, border radius)
- **Conditional classes**: do not use template literals to do conditional classes, instead use `classnames` package

## Type Safety

- Never use `as` casting; use typed parsing and type guards
- Define explicit interfaces for all API interactions
- Use discriminated unions with `isSuccessResponse()` patterns
- **Exhaustive Switch Statements**: For discriminated unions, use switch statements with exhaustive case coverage rather than if-else chains. Always include a `default: throw new UnreachableError(value)` case to ensure compile-time detection of unhandled types
- Keep types in `types.ts` files alongside implementation; `types.ts` must contain only interfaces and type aliases — no functions, classes, or runtime code
- Add `import type` for framework types (e.g., `ImageMetadata`)
- Prefer compile-time errors over runtime failures
- You are forbidden to modify eslint config and tsconfig files. In situations where it is required, you must tell prompter, explain the need and what it solves, and ask the prompter to manually do this.

### Exhaustive Switch Pattern

**Problem**: If-else chains for discriminated unions don't provide compile-time exhaustiveness checking:

```typescript
// BAD - No compile-time check if new type is added
if (group.type === "neatqueue-series") {
  // handle series
} else if (group.type === "grouped-matches") {
  // handle grouped
} else {
  // handle single-match - but what if a new type is added?
}
```

**Solution**: Use switch statements with `UnreachableError` in the default case:

```typescript
// GOOD - Compile error if new type added but not handled
switch (group.type) {
  case "neatqueue-series": {
    // handle series
    break;
  }
  case "grouped-matches": {
    // handle grouped
    break;
  }
  case "single-match": {
    // handle single
    break;
  }
  default: {
    throw new UnreachableError(group.type); // Compile error if cases incomplete
  }
}
```

Benefits:

- **Type Safety**: TypeScript catches missing cases at compile time
- **Maintainability**: Adding new union types forces code updates
- **Runtime Safety**: `UnreachableError` catches impossible states
- **Self-Documenting**: All possible types visible in one place

Use this pattern for:

- Discriminated union type fields (`type`, `kind`, `status`, etc.)
- Any branching logic based on string literal union types
- Mapping or transforming data based on type discriminators

## Testing Instructions

- **Test Runner**: Use vitest only (`npm test`)
- **Structure**: Use `describe` and `it`, separate tests with blank lines
- **Test Descriptions**: Use factual present tense ("returns X", "throws error") rather than indicative ("should return X")
- **Black Box**: Test inputs/outputs only, no internal mocking
- **Dependencies**: Only mock constructor dependencies, never internal methods
- **Data**: Use fake factories (`aFake...With()`) for test data
- **Conditional Assertions**: Use `expect.assertions(n)` when assertions are inside conditionals (if statements, type guards, loops) to ensure they execute
- Tests must pass before committing

### Conditional Assertion Pattern

**Problem**: Assertions inside conditionals can silently pass if the condition is false:

```typescript
// BAD - Test passes even if type guard fails
const result = parseData();
if (result?.type === "expected") {
  expect(result.field).toBe("value"); // Never runs if type is wrong
}
```

**Solution**: Declare expected assertion count at the start:

```typescript
// GOOD - Test fails if assertion doesn't run
expect.assertions(2); // Declare expected count
const result = parseData();
if (result?.type === "expected") {
  expect(result.field).toBe("value"); // Must run or test fails
}
```

Use this pattern for:

- Type guard conditionals (`if (x?.type === "...")`)
- Discriminated union narrowing
- Loop iterations with assertions
- Any assertion inside control flow

### Mock and Spy Type Safety

**Prefer `vi.spyOn()` over `vi.mock()` when possible**

When mocking or spying, always use strongly-typed approaches:

1. **For `vi.spyOn()` on methods:**

   ```typescript
   import type { MockInstance } from "vitest";

   let spy: MockInstance<typeof console.info>;
   spy = vi.spyOn(console, "info").mockImplementation(() => {});
   ```

2. **For mocked objects implementing an interface:**

   ```typescript
   import type { Mocked } from "vitest";

   let mockClient: Mocked<LogService>;
   mockClient = {
     debug: vi.fn<LogService["debug"]>(),
     info: vi.fn<LogService["info"]>(),
   };
   ```

3. **For hoisted module mocks (with `vi.mock()`):**

   ```typescript
   import type { captureException } from "@sentry/cloudflare";

   const { captureExceptionMock } = vi.hoisted(() => ({
     captureExceptionMock: vi.fn<typeof captureException>(),
   }));

   vi.mock("@sentry/cloudflare", () => ({
     captureException: captureExceptionMock,
   }));
   ```

- Do not use `vi.fn()` without type parameters
- Do not use `ReturnType<typeof vi.spyOn>` - use `MockInstance<typeof target.method>` instead
- Do not override properties using `X.y = vi.fn()`, use `vi.spyOn()` to preserve the original implementation

4. **Mocking and overloads**

```typescript
const kvGetSpy: MockInstance = vi.spyOn(env.APP_DATA, "get");
kvGetSpy.mockResolvedValue(null);
```

- Used when a method signature has overloads and the right type cannot be selected
- Create a spy with the type `MockInstance`
- On a separate line, mock the value accordingly

## Architecture & Environment

**Stack**:

- Cloudflare Workers (edge computing), Durable Objects (persistent state), D1 (relational), KV (fast temporary)
- Node.js 24.11.0+, TypeScript strict mode, Node ESM

**Patterns**:

- Dependency injection (constructor injection), Command pattern (Discord interactions), Service layer (business logic)
- Black-box testing with fake factories (`aFake...With()`)

**Development**:

- Use `.dev.vars` for local environment
- Run commands from project root
- Validate with `npm run typecheck` after refactors

## Agent Workflow

**Communication**: Factual statements only, no emotive language

**Approach**: Explore code first, follow nearest-neighbor patterns, ask before assuming

**Implementation Steps**:

1. Propose plan and gain alignment
2. Implement solution
3. Validate: `npm run typecheck`, `npm run lint:ts:fix`, `npm run stylelint:pages:fix` (for CSS)
4. Confirm with user
5. Add/update tests if applicable (`npm test`)
6. Format: `npm run format:fix`

**Security**:

- Never read from `.env`, `api/.dev.vars`, or `api/.production.vars`. You can read an example from `api/.example.dev.vars`.
