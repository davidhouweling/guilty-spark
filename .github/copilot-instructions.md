# Project Coding & Testing Standards

## Linting & Formatting

- **Linting:** Use `eslint` for code linting. Run `npm run lint:fix` to auto-fix issues.
- **Formatting:** Use `prettier` for code formatting. Run `npm run format:fix` to auto-format code.
- **Strict Adherence:** All code must pass lint and format checks before merging.

## TypeScript Usage

- **Strict Mode:** Follow the `tsconfig.json` configuration strictly.
- **No Unsafe Casts:** Do not cast to `unknown` or `any`.
- **No TypeScript Suppression:** Never use `@ts-expect-error` to bypass TypeScript errors.
- **Explicit Types:** Always define variables and function signatures with explicit types. Prefer direct type imports over type extraction from function signatures.
- **No Inline Imports:** Do not use inline `import()` type annotations in variable declarations. Always import types at the top of the file.
- **No ! Operator:** Avoid using the non-null assertion operator (`!`) in TypeScript. Use `Preconditions.checkExists` for null checks instead.
- **Importing Types:** Always import types directly from their source files (e.g., `import type { MyType } from "./my-type.mjs"`) separately from the functional import. Do not use `import { MyType } from "./my-type.mjs"` for types.
- **Import path extensions:** Always use `.mjs` for import paths, never `.mts`. This is consistent with the Node ESM module system.

## Coding Conventions

- **for loops:** Prefer `for...of` loops instead of `for...in`, traditional `for` loops, or `[].forEach`.
- **enum branching:** Use `switch` statements for enum branching instead of `if...else` chains, where `default` should `throw new UnreachableError()` (located in `src/base/unreachable-error.mts`).
- **readability:** Write code for readability, not for cleverness. Avoid complex one-liners. Add blank lines between logical sections of code to enhance clarity.

## Module System & Imports

- **Node ESM:** The project uses Node's `type: module`.
- **Import Extensions:** Always use `.mjs` for import statements (never `.mts`).
- **No Other Compilers:** Only use Node and TypeScript import approaches—no custom compilers or loaders.

## Project Structure

- **Source Code:** Place all source files in the `src/` directory.
- **Tests:** Place all tests in a sibling `tests/` folder to the code being tested.
- **Fakes:** Place all fakes in a sibling `fakes/` folder to the code being tested. Fakes are for tests only, never for production code.
- **Naming:** The main file in a folder should match the folder name (e.g., `src/services/discord/discord.mts`). When creating files, use lowercase kebab-case for file names (e.g., `discord.mts`, `round-robin.mts`).

## Testing Conventions

- **Test Runner:** Use `vitest` only. Do not use `jest` or native `node:test`.
- **Test Structure:**
  - Use `describe` and `it` exclusively (not `test`).
  - `it` statements must be factual, not use "should" phrasing.
  - Each test declaration must be separated by a blank line.
  - Within each test, separate setup, spying, execution, and assertion with blank lines.
  - Use `beforeEach` to ensure clean instances for each test.
- **Black Box Testing:**
  - Treat tests as black box: test input and expect output only.
  - Do not mock modules or private methods.
  - Never mock or spy on methods from the file under test. Only mock dependencies passed via the constructor.
- **Type Safety in Tests:**
  - When assigning types for test variables (e.g., expected arguments for spies), always import and use the direct type (e.g., `Partial<MyType>`), not `Parameters<typeof fn>[0]`.
  - This ensures clarity, maintainability, and type safety.
- **Fakes Usage:**
  - Use fakes (named `aFake...With()`) for test data. Prefer fakes over ad-hoc objects.
  - Fakes should allow overrides via spread for differentiation.

## Example Structure

```
<root>/src/services/discord/discord.mts
<root>/src/services/discord/tests/discord.test.mts
<root>/src/services/discord/fakes/aFakeDiscordWith.mts
```

---

For questions or clarifications, contact the project maintainers.
