# AI Assistance Behavior

Rules of engagement:

- Never agree with me unless my reasoning is watertight.
- If the input is vague or there is any uncertainty, always ask clarifying questions to understand true intent and direction.
- Never use friendly or encouraging language. Do not flatter or encourage.
- Avoid unqualified statements about the value of an idea.
- Identify the major assumptions and then inspect them carefully before proceeding.
- If information or explanations are asked for, break down the concepts as systematically as possible, i.e. begin with a list of the core terms, and build upon it.
- When considering approaches, always look at files that are adjacent to the ones you are modifying to understand structures, patterns, and practices leveraged and follow those conventions.
  - When this isn't available, ask for clarification or additional context and guidance before proceeding.

## Context Gathering & Implementation Strategy

- **Thorough Investigation:** Before making changes, comprehensively analyze existing code patterns, test structures, and architectural decisions.
- **Pattern Recognition:** Study similar implementations in the codebase to understand established conventions (e.g., service patterns, command structures, embed creation).
- **Gap Analysis:** When asked to add features or tests, systematically identify what already exists vs. what needs to be created.
- **Implementation Consistency:** Ensure new code follows the exact same patterns as existing code (naming, structure, error handling, logging).

Execution of system commands in terminal:

- Assume the current directory is the root of the node project, there is no need to prefix command runs with `cd <project path>`
- As this is a node project, the default package manager is `npm`
- Do your best to stick with the listed scripts in the `package.json` file for testing, linting, formatting, etc.
- Do not try and build the project, but instead rely on tests, and type checking (`npm run typecheck`) to validate that things run.
- You are permitted to execute `node` commands in the terminal but they must not be destructive.
- You are only permitted to run deletion commands on files that you have created in the session, if you need to remove other files, you must ask for permission first and justify why.

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
- **Error Handling:** Use `EndUserError` for user-facing errors with appropriate `EndUserErrorType` (WARNING, ERROR, etc.). Include contextual information in error messages.
- **Logging:** Use the injected `LogService` for debugging and information logging. Include relevant context in log messages using `Map` structures.
- **Null Safety:** Use `Preconditions.checkExists()` instead of non-null assertion operator (`!`) for runtime null checks with descriptive error messages.

## Service Layer Patterns

- **Dependency Injection:** Services receive dependencies through constructor injection. Never access global state or singletons directly.
- **Interface Segregation:** Services should have focused responsibilities. Large services should be broken into smaller, specialized services.
- **Async Operations:** All service methods that perform I/O should be async and properly handle errors and timeouts.
- **Caching Strategy:** Implement caching at the service level for expensive operations (API calls, database queries) using appropriate cache keys and TTL.
- **Rate Limiting:** Respect external API rate limits using service-level throttling and retry logic with exponential backoff.

## Discord Integration Patterns

- **Message Structure:** Follow established patterns for Discord message creation, including proper embed structures, button components, and select menus.
- **Interaction Handling:** Use the command pattern for handling different interaction types (APPLICATION_COMMAND, MESSAGE_COMPONENT, MODAL_SUBMIT).
- **Response Management:** Distinguish between immediate responses, deferred responses, and follow-up messages based on processing time requirements.
- **Error Responses:** Provide user-friendly error messages through Discord's ephemeral responses when operations fail.

## Database Integration

- **Transaction Management:** Use database transactions for operations that modify multiple records or require consistency.
- **Type Safety:** Leverage database schema types for query parameters and results. Use generated types where available.
- **Query Optimization:** Structure queries to minimize database round trips and use appropriate indexes.
- **Migration Strategy:** Handle database schema changes through migrations, never direct schema modifications.

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

### Basic Test Structure

- **Test Runner:** Use `vitest` only. Do not use `jest` or native `node:test`.
- **Test Organization:**
  - Use `describe` and `it` exclusively (not `test`).
  - `it` statements must be factual, not use "should" phrasing.
  - Each test declaration must be separated by a blank line.
  - Within each test, separate setup, spying, execution, and assertion with blank lines.
  - Use `beforeEach` to ensure clean instances for each test.

### Black Box Testing Principles

- **Treat tests as black box:** Test input and expect output only.
- **No Internal Mocking:** Do not mock modules or private methods.
- **Constructor Dependencies Only:** Never mock or spy on methods from the file under test. Only mock dependencies passed via the constructor.
- **Behavioral Testing:** Focus on testing the behavior and outcomes, not the internal implementation details.

### Comprehensive Test Coverage Guidelines

When implementing complex functionality:

1. **Hierarchical Test Organization:**
   - Use nested `describe` blocks to group related scenarios
   - Organize by feature area, then by specific behaviors
   - Each describe block should test a cohesive set of functionality

2. **Scenario Coverage Matrix:**
   - **Basic scenarios:** Core functionality with simple inputs
   - **Edge cases:** Boundary conditions, empty inputs, malformed data
   - **Complex scenarios:** Multiple interacting components, algorithmic edge cases
   - **Error handling:** API failures, network issues, invalid states
   - **Performance:** Caching behavior, optimization paths
   - **Integration:** Cross-system interactions, database operations

3. **Test Depth Strategy:**
   - Start with high-level integration tests for main user flows
   - Add focused unit tests for specific business logic
   - Include negative test cases for all major code paths
   - Test both success and failure scenarios thoroughly

### Helper Function Design

When creating test helper functions:

1. **Reusable Mock Factories:**

   ```typescript
   // Helper functions for creating test objects
   const mockServiceWithCustomData = (dataItems: Array<{ id: string; name: string }>) => {
     return async (ids: string[]) => {
       return Promise.resolve(ids.map((id, i) => createTestObject(dataItems[i] || { id, name: `default${i}` })));
     };
   };
   ```

2. **Parameterized Test Data:**
   - Create functions that accept parameters for test variations
   - Use spread operators to allow overrides while maintaining defaults
   - Document helper functions with comments explaining their purpose

3. **Assertion Helpers:**
   ```typescript
   const expectSpecificObjectStructure = (id: string) => {
     return expect.objectContaining({
       Id: id,
       Status: ExpectedStatus.ACTIVE,
       Type: ExpectedType.STANDARD,
     });
   };
   ```

### Test Implementation Process

1. **Requirements Analysis:**
   - Break down complex features into testable components
   - Identify all input/output combinations
   - Map error conditions and edge cases

2. **Test Structure Planning:**
   - Design `describe` block hierarchy before writing tests
   - Plan helper functions for common setup patterns
   - Identify reusable assertion patterns

3. **Implementation Strategy:**
   - Implement tests incrementally, starting with basic scenarios
   - Run tests frequently to ensure they pass as you build
   - Refactor helper functions as patterns emerge

4. **Validation and Refinement:**
   - Ensure all tests align with actual service behavior
   - Remove redundant tests that don't add value
   - Verify test names accurately describe what is being tested

### Mock Setup Best Practices

- **Fresh Responses:** Use `mockImplementation()` with fresh Response objects for each call to avoid "Body has already been read" errors in fetch mocks.
- **Realistic Data:** Mock responses should match the actual API structure and include all required fields for the code path being tested.
- **Error Simulation:** Test error conditions by mocking appropriate HTTP status codes, network failures, and malformed responses.
- **Isolation:** Each test should have its own mock setup to prevent interference between tests. Avoid shared `beforeEach` setups for different test scenarios.

### Test Data Management

- **Constants Accuracy:** When using constants in tests (e.g., bot user IDs), ensure they match the actual values used in production code.
- **Fake Data Factories:** Use the existing fake data pattern (`aFake...With()`) for creating test objects with sensible defaults and override capabilities.
- **Outcome Mapping:** When testing game logic, verify the actual outcome values in test data files rather than assuming mappings (e.g., MatchOutcome.Win = 2, Loss = 3).

### Integration Testing

- **End-to-End Flows:** Test complete user workflows from Discord interaction to final response, including all intermediate service calls.
- **Component Integration:** Verify that services integrate correctly with their dependencies, especially for complex operations like queue processing or live tracking.
- **External API Simulation:** Mock external APIs (Discord, Halo Infinite) with realistic response patterns and error conditions.

### Test Quality & Data Management

- **Test Standards:**
  - No inline comments - test names and structure should be self-documenting
  - Meaningful test names that clearly state what behavior is being verified
  - Focused assertions - each test should verify one specific behavior or outcome
  - Predictable mocking behavior consistent across test runs

- **Type Safety:**
  - Import types directly (e.g., `Partial<MyType>`), not `Parameters<typeof fn>[0]`
  - Define explicit interfaces for test data structures
  - Ensure mock implementations match expected interface signatures

- **Test Data & Fakes:**
  - Use fakes (named `aFake...With()`) for test data, prefer over ad-hoc objects
  - Support overrides via spread for differentiation
  - Ensure fake data represents realistic scenarios the code will encounter
  - Verify constants match actual production values (e.g., bot user IDs)

- **Debugging Test Failures:**
  - Investigate actual vs. expected behavior rather than adjusting test expectations
  - Cross-reference test expectations with actual implementation logic
  - Verify test data contains values and structure that code expects
  - Check mocks are properly reset between tests and provide fresh instances when needed
  - Ensure tests remain robust through reasonable code refactoring

## Implementation Best Practices

### Feature Development Workflow

1. **Analysis Phase:**
   - Understand the existing codebase patterns thoroughly before implementing new features
   - Identify similar existing implementations to use as reference
   - Map out dependencies and integration points
   - Plan the testing strategy alongside the implementation

2. **Implementation Phase:**
   - Start with the core business logic and work outward to integrations
   - Follow established patterns for service structure, error handling, and logging
   - Implement comprehensive error handling from the beginning, not as an afterthought
   - Use dependency injection consistently for testability
   - Break complex features into smaller, testable components and implement them progressively
   - Run tests frequently during development to catch issues early and ensure integration remains stable

3. **Testing Phase:**
   - Write tests that reflect actual behavior, not assumed behavior
   - Test error conditions and edge cases thoroughly
   - Ensure mocks accurately represent real API responses and data structures
   - Validate that test expectations match implementation reality
   - When encountering errors, analyze them systematically to understand root causes rather than applying superficial fixes

4. **Integration Phase:**
   - Test the feature end-to-end in the context of the larger system
   - Verify that logging provides adequate debugging information
   - Ensure error messages are user-friendly and actionable

### Code Organization & Architecture

- **Single Responsibility:** Each service, command, and function should have a clear, focused purpose
- **Consistent Interfaces:** Follow established patterns for method signatures, return types, and error handling
- **Dependency Clarity:** Make dependencies explicit through constructor injection rather than implicit through imports
- **Separation of Concerns:** Keep business logic separate from infrastructure concerns (Discord API, database, etc.)
- **Pattern Adaptation:** When existing patterns don't perfectly fit new requirements, adapt them thoughtfully while maintaining consistency

### Testing & Quality Strategy

- **Test What Matters:** Focus on testing behavior and outcomes, not implementation details
- **Realistic Scenarios:** Use test data that reflects real-world usage patterns
- **Comprehensive Coverage:** Test both happy paths and error conditions
- **Maintainable Tests:** Write tests that will remain valid as the code evolves

### Debugging and Troubleshooting

- **Systematic Approach:** When encountering issues, examine the actual vs. expected behavior systematically
- **Context Gathering:** Use logging and debugging tools to understand the full context of issues
- **Root Cause Analysis:** Address underlying causes rather than symptoms
- **Documentation:** Document complex issues and their solutions for future reference

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

---

For questions or clarifications, contact the project maintainers.
