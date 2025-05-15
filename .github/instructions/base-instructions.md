---
applyTo: "**"
---

We use eslint to lint our code, and prettier to format. These should be strictly followed, with the npm scripts `lint:fix` and `format:fix` able to be used to run auto fix for each.

Typescript is also leveraged, with strict adherence to the `tsconfig.json` setup. In addition to this, casting to `unknown` or `any` should not be done, and never use `@ts-expect-error` to circumvent typescript.

Coding wise, prioritize defining variables with explicit types, over casting.

We also make use of node's "type: module", so all import statements should use `.mjs` extension instead of `.mts`. We do not have any other compilers, so strictly follow node and typescripts import approaches only.

Tests are to be created in a `tests` folder making use of `vitest` only (meaning no `jest` and no native `node:test` usage). `it` statements are to be factual statements, rather than `should` statements. Always use `describe` and `it`, not the alternatives. Do not mock modules or `spyOn` private methods. Tests should always be considered black box, where we test an input and expect an output. On the premise that the code execution depends on data somewhere else, the dependency is passed in as part of the constructor, and only that should be spied on and mocked with the respective response. Tests should follow the formatting of a blank line between each test declaration, and spacing between setup, spying, execution, and assertion within the test. Leverage `beforeEach` to ensure clean instances are used for each test.

When assigning types for test variables (such as expected arguments for spies), always prefer importing and using the direct type (e.g., Partial<MyType>) rather than extracting types from function signatures (e.g., Parameters<typeof fn>[0]). This ensures clarity, maintainability, and type safety. Do not use inline import() type annotations in variable declarations, as these are not allowed in strict TypeScript configurations. Always import the type at the top of the file and use it directly in your type annotations. This approach will ensure that if the type changes, TypeScript will catch mismatches at compile time.

Fakes have also be defined where necessary in a sibling folder to `tests` called `fakes`. These should only be leveraged for tests, never in the actual code implementation. When defining fakes, follow the convention of `aFake...With()`. For tests, this should be the preferred approach to take over creating an isolated object with the data, as the fakes contain existing data that can be reused, and with ability to pass in override values which are then spread can help when needing to differentiate.

Taking the tests and fakes into account, follow the structure of `<root>/src/services/discord` where the primary functionality is the same name as the folder (i.e. `discord.mts`), tests exist in `tests`, fakes are in `fakes`.
