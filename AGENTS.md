# AGENTS.md

## Project Overview

Discord bot built on Cloudflare Workers with Node.js ESM support. The bot provides Halo Infinite statistics, live match tracking, and tournament features.

**Tech Stack**: TypeScript, Cloudflare Workers, D1 Database, Durable Objects, Discord API

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

- `src/worker.mts` - Main Cloudflare Worker entry point
- `src/server.mts` - Request routing and dependency injection
- `src/services/install.mts` - Service configuration and wiring
- `src/commands/` - Discord slash commands and interactions
- `src/durable-objects/` - Persistent state management for live tracking

**Key Commands**:

- `/connect` - Link Discord to Xbox gamertag
- `/stats` - Show Halo Infinite match statistics
- `/maps` - Generate HCS tournament maps
- `/track` - Live match tracking with real-time updates

## File Structure

- `src/` - Source code with `.mts` extensions for Node ESM
- `src/commands/` - Discord command implementations
- `src/services/` - Business logic and external integrations
- `src/durable-objects/` - Cloudflare Durable Objects for state
- Tests in sibling `tests/` folders, fakes in `fakes/` folders
- Use `.mjs` for imports, never `.mts`

## Code Style

- **TypeScript**: Strict mode, explicit types, no `any`, `unknown` or `!` operator
- **Imports**: Always use `.mjs` extensions for import paths
- **Loops**: Prefer `for...of` over `forEach` or traditional `for` loops
- **Error Handling**: Use `EndUserError` for user-facing errors
- **Null Safety**: Use `Preconditions.checkExists()` instead of `!`
- **Formatting**: Run `npm run lint:fix` and `npm run format:fix`

## Type Safety Principles

- **No Unsafe Assertions**: Never use `as` casting or manual type assertions; always use proper typed parsing
- **Request/Response Typing**: Define explicit interfaces for all API interactions with external services
- **Type Guards**: Use discriminated unions and type guard functions for safe response handling
- **Centralized Types**: Keep related types in dedicated `types.mts` files alongside implementation
- **Response Discrimination**: Use `isSuccessResponse()` patterns for safe success/failure handling
- **API Contracts**: Types serve as living documentation and enforce API compatibility
- **Compile-Time Safety**: Prefer TypeScript compilation errors over runtime type failures

## Testing Instructions

- **Test Runner**: Use vitest only (`npm test`)
- **Structure**: Use `describe` and `it`, separate tests with blank lines
- **Black Box**: Test inputs/outputs only, no internal mocking
- **Dependencies**: Only mock constructor dependencies, never internal methods
- **Data**: Use fake factories (`aFake...With()`) for test data
- Tests must pass before committing

## Development Environment

- **Node.js**: 22.11.0+ required
- **Environment**: Use `.dev.vars` for local development
- **Commands**: Stick to npm scripts in `package.json`
- **Validation**: Use `npm run typecheck` instead of building
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

## Known Issues & Workarounds

### halo-infinite-api ESM Import Issues

**Problem:** When running `npm run register`, you may encounter `SyntaxError: The requested module 'halo-infinite-api' does not provide an export named 'MatchType'` or similar errors for other exports like `GameVariantCategory`.

**Root Cause:** The `halo-infinite-api` package was compiled for CommonJS but the project uses ESM. The package's JavaScript files have import statements without `.js` extensions, which are required for Node.js ESM. This works fine with TypeScript compilation but fails with TSX runtime execution.

**Diagnosis Steps:**

1. Verify `npm run typecheck` and `npm run build` work fine (TypeScript compilation succeeds)
2. Verify the error only occurs with `npm run register` (TSX runtime execution)
3. Confirm the exports exist in `node_modules/halo-infinite-api/dist/index.js`
4. Check that the issue persists even without the `halo-infinite-api` patch

**Solution:** Replace problematic imports with local constants that match the enum values:

1. **For MatchType imports:**

   ```typescript
   // Replace: import { MatchType } from "halo-infinite-api";
   // With:
   const MatchType = {
     Custom: 2, // From halo-infinite-api MatchType enum
   } as const;
   ```

2. **For GameVariantCategory imports:**
   ```typescript
   // Replace: import { GameVariantCategory } from "halo-infinite-api";
   // With:
   const GameVariantCategory = {
     MultiplayerSlayer: 6,
     MultiplayerAttrition: 7,
     MultiplayerElimination: 8,
     MultiplayerFiesta: 9,
     MultiplayerStrongholds: 11,
     MultiplayerKingOfTheHill: 12,
     MultiplayerTotalControl: 14,
     MultiplayerCtf: 15,
     MultiplayerExtraction: 17,
     MultiplayerOddball: 18,
     MultiplayerStockpile: 19,
     MultiplayerInfection: 22,
     MultiplayerVIP: 23,
     MultiplayerEscalation: 24,
     MultiplayerGrifball: 25,
     MultiplayerLandGrab: 39,
     MultiplayerMinigame: 41,
     MultiplayerFirefight: 42,
   } as const;
   type GameVariantCategory = (typeof GameVariantCategory)[keyof typeof GameVariantCategory];
   ```

**Files Typically Affected:**

- `src/commands/connect/connect.mts` (MatchType)
- `src/embeds/stats/create.mts` (GameVariantCategory)

**Note:** These workarounds should be temporary and not committed to the repository. They allow `npm run register` to work while maintaining full functionality since the local constants match the exact values from the halo-infinite-api package.
