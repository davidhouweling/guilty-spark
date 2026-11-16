# Agent guidance

Read this file before writing code. Also read the applicable guides before
working in their scope; links alone do not guarantee their contents are loaded:

- [API and shared architecture](.github/agent-guidance/api.md): editing or
  reviewing `api/` or `shared/`.
- [Pages architecture](.github/agent-guidance/pages.md): editing or reviewing
  `pages/`.
- [Testing guidance](.github/agent-guidance/testing.md): adding or changing tests
  or validating behavior.
- [Code review skill](.github/skills/code-review/SKILL.md): reviewing PRs or
  triaging review findings, including the Copilot review loop.

Guilty Spark is a Discord bot and web platform for Halo Infinite NeatQueue
leagues. This TypeScript monorepo has `api/` (Cloudflare Worker and Durable
Objects), `pages/` (Astro and React), and `shared/` (contracts and utilities).

## Commands

```bash
npm start                         # API and Pages development servers
npm run start:api                 # API development server
npm run start:pages               # Pages development server
npm test                          # All workspaces
npx vitest run <path>             # Focused tests
npm run typecheck                 # API and Pages
npm run typecheck:api             # API only
npm run typecheck:pages           # Pages only
npm run lint:changed:fix          # Changed TypeScript plus Pages Stylelint
npm run lint:ts:changed:fix       # Changed TypeScript only
npm run format:fix                # Format repository
npm run done                      # Changed format, typechecks, changed TS lint, Pages Stylelint, related tests
```

For other scripts, including build, deploy, and coverage, see `package.json`.

Due to memory constraints, never run `lint`, `lint:fix`, `lint:ts`, or
`lint:ts:fix`. Use the changed-file commands above. If invoking ESLint directly,
always supply specific files or folders; never lint the whole repository.

## Implementation

- Understand the requirements and ask for clarification when uncertain. Follow
  the nearest applicable pattern, but do not replicate a known architectural
  violation. Keep changes scoped, preserve existing behavior, and surface errors.
- Group related code by feature. Colocate shared types in `types.ts`, fakes in
  `fakes/` with `aFake...With(overrides?)` factories, and tests in `tests/`.
  Extract growing service helpers into named files with dedicated tests.
- Use extensionless internal TypeScript imports and package entrypoints across
  workspaces. Import directly from source modules; do not add intermediary
  re-exports. Use `import type` for type-only imports.
- TypeScript is strict: no `any`, `unknown`, non-null `!`, or `as` casts in
  production code. Use `Preconditions.checkExists(value, "message")` instead of
  `!`. The accepted cast exception is `as unknown as X` for test global stubs.
- Every union `switch` uses braced cases and
  `default: { throw new UnreachableError(value); }`.
- Use `EndUserError` for user-facing validation; system errors propagate to
  Sentry. Use `for...of`, not `.forEach`, and `date-fns` for date operations.
- If an optional property can also be supplied as `undefined`, declare the
  explicit union, e.g. `window?: Foo | undefined`.
- Keep functions focused on one responsibility; aim for 5-20 lines. Prefer a
  named extraction over a comment explaining a block. Use tests to explain edge
  cases; reserve comments for non-obvious reasons or contracts.
- Extract side-effectful fire-and-forget work into a named async function and
  invoke it with `void`, not a `.then().catch()` chain. Presenters use a private
  `<publicMethod>Async`; hooks/effects use a named inner async function with
  cancellation and error handling. Returning transformation chains to
  `Promise.all` is fine. `void` must not hide an unintended floating promise.

## Safety

- Never read `.env`, `api/.dev.vars`, or `api/.production.vars`. Only use
  `api/.example.dev.vars` as an example.
- Never modify `eslint.config.*` or `tsconfig*.json`; explain the need and ask
  the user to change them manually.
- Never return tokens to the browser. The proxy owner-token path is server-side
  only and fails closed to the bot.

## Feature workflow

1. Start feature work on a new branch; never commit or push to `main`.
2. Aim for 300 changed lines per PR, with a hard limit of 500. Split larger work
   or obtain explicit user approval for a particular exception.
3. If requirements exceed three PRs, maintain an uncommitted plan with decisions
   and progress. When working from a plan, ask whether to use a single agent or
   an orchestrator with delegated work.
4. Follow existing patterns, implement, and commit when complete. If
   `/code-review` is available, review and fix in a loop, committing each
   iteration. Follow the review skill's scope, intent, and human-decision gates.
5. Before completion, run format, lint, typecheck, and tests using the permitted
   commands; commit any remaining fixes.
6. Raise a PR only when instructed, using `gh` and sections **Context**,
   **This change**, and optionally **Subsequent work**. Summarize the result,
   link the PR, and suggest starting the Copilot loop.
7. Update any active plan with progress and prompt for the next action.
