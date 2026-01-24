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

- `api/worker.mts` - Main Cloudflare Worker entry point
- `api/server.mts` - Request routing and dependency injection
- `api/services/install.mts` - Service configuration and wiring
- `api/commands/` - Discord slash commands and interactions
- `api/durable-objects/` - Persistent state management for live tracking

**Key Commands**:

- `/connect` - Link Discord to Xbox gamertag
- `/stats` - Show Halo Infinite match statistics
- `/maps` - Generate maps for custom games
- `/track` - Live match tracking with real-time updates

## File Structure

- `api/` - Discord bot API source code with `.mts` extensions for Node ESM
  - `api/commands/` - Discord command implementations
  - `api/services/` - Business logic and external integrations
  - `api/durable-objects/` - Cloudflare Durable Objects for state
- `pages/` - Cloudflare Pages website
  - `pages/src/` - Astro components, pages, and styles
- `contracts/` - Shared types and contracts
- Tests in sibling `tests/` folders, fakes in `fakes/` folders
- Use `.mjs` for imports, never `.mts`
- Import Astro components directly (e.g., `../components/cards/demo-card.astro`); avoid `.astro` barrel files that break eslint resolution.
- Maintain a single source of truth for shared components.
- For astro components, consolidate commonalities into a sub folder, example being `cards`

## Code Style

- **TypeScript**: Strict mode, explicit types, no `any`, `unknown` or `!` operator
- **Imports**: Always use `.mjs` extensions for import paths
- **Loops**: Prefer `for...of` over `forEach` or traditional `for` loops
- **Error Handling**: Use `EndUserError` for user-facing errors
- **Null Safety**: Use `Preconditions.checkExists()` instead of `!`
- **Formatting**: Run `npm run lint:fix` and `npm run format:fix`
- **Accessibility**: Preserve established ARIA attributes, focus handling, and keyboard support patterns when extending interactive components.
- **Rendering Patterns**: Prefer data-driven rendering—extend typed configuration arrays and map to components instead of duplicating inline markup.

## Conventions (Contracts, API, Pages)

- **Feature folders**: Group related code under a single feature folder (e.g. `live-tracker/`) rather than scattering files at top level.
- **Types live beside implementation**:
  - Contracts: `contracts/src/<feature>/types.mts` and other modules in the same folder.
  - API/Pages: keep feature/service types colocated with the feature/service.
- **Fakes live under the feature**: Use `<feature>/fakes/` (not a standalone global `fakes/`).
  - Use `fakes/data.mts` for deterministic sample fixtures/data.
  - Use separate fake implementations for behavior (e.g. service fakes) when needed.
- **Imports**:
  - Prefer importing from stable package entrypoints (e.g. `@guilty-spark/contracts/live-tracker/types`) over deep relative paths across packages.

## CSS/Styling Principles (Pages Project)

- **Mobile-First Approach**: Start with mobile base styles, enhance progressively for larger screens
- **Custom Media Queries**: Use PostCSS custom media from `variables.css`:
  - `@media (--mobile-viewport)` - max-width: 749.9px (rarely needed, mobile is default)
  - `@media (--tablet-viewport)` - min-width: 750px
  - `@media (--desktop-viewport)` - min-width: 1000px
  - `@media (--ultrawide-viewport)` - min-width: 1200px
- **Organization**: Group all media queries at the bottom of `<style>` blocks with clear section headers
- **Structure Pattern**:

  ```
  <style>
    /* Base Styles - Mobile First */
    .element { /* mobile styles */ }

    /* Media Queries - Tablet and Above */
    @media (--tablet-viewport) {
      .element { /* tablet overrides */ }
    }

    /* Media Queries - Desktop and Above */
    @media (--desktop-viewport) {
      .element { /* desktop overrides */ }
    }
  </style>
  ```

- **Progressive Enhancement**: Only override properties that change at larger breakpoints
- **Avoid Desktop-First**: Never use `max-width` media queries unless absolutely necessary
- **Consistent Blocks**: Keep the “Base / Tablet / Desktop” comment structure and place new declarations in the appropriate section to preserve readability.

## Type Safety Principles

- **No Unsafe Assertions**: Never use `as` casting or manual type assertions; always use proper typed parsing
- **Request/Response Typing**: Define explicit interfaces for all API interactions with external services
- **Type Guards**: Use discriminated unions and type guard functions for safe response handling
- **Centralized Types**: Keep related types in dedicated `types.mts` files alongside implementation
- **Response Discrimination**: Use `isSuccessResponse()` patterns for safe success/failure handling
- **API Contracts**: Types serve as living documentation and enforce API compatibility
- **Compile-Time Safety**: Prefer TypeScript compilation errors over runtime type failures
- **Astro Types**: When component props rely on framework-provided types (for example `ImageMetadata`), add the corresponding `import type` so files remain self-contained.

## Testing Instructions

- **Test Runner**: Use vitest only (`npm test`)
- **Structure**: Use `describe` and `it`, separate tests with blank lines
- **Black Box**: Test inputs/outputs only, no internal mocking
- **Dependencies**: Only mock constructor dependencies, never internal methods
- **Data**: Use fake factories (`aFake...With()`) for test data
- Tests must pass before committing
- Do not override a property using `X.y = vi.fn()`, use `vi.SpyOn()` to preserve the original implementation

## Development Environment

- **Node.js**: 24.11.0+ required
- **Environment**: Use `.dev.vars` for local development
- **Commands**: Stick to npm scripts in `package.json`
- **Validation**: Use `npm run typecheck` instead of building, and rerun it after structural refactors to catch slot/type regressions early.
- **Directory**: Assume commands run from project root

- **Dependency Injection**: Services use constructor injection for testability
- **Command Pattern**: Discord interactions handled through unified command interface
- **Service Layer**: Business logic separated from infrastructure concerns
- **Black-Box Testing**: Test behavior and outcomes, not implementation details
- **Fake Data**: Use `aFake...With()` pattern for test objects with overrides

## Architecture Decisions

- **Cloudflare Workers**: Edge computing for global low-latency Discord responses
- **Durable Objects**: Persistent state for live match tracking across worker restarts
- **Node ESM + .mjs**: Required for Cloudflare Workers Node.js compatibility
- **D1 + KV Storage**: D1 for relational integrity, KV for fast temporary state
- **TypeScript Strict**: Comprehensive type safety without unsafe casts
