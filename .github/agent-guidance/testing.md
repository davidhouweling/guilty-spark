# Testing guidance ([root guidance](../../AGENTS.md))

- Use Vitest: `npm test` for all workspaces or `npx vitest run <path>` for
  focused tests. API and shared tests use Node; Pages tests use jsdom.
- Write black-box tests for behavior introduced or fixed, including meaningful
  edge cases. Do not add tests solely for constants, trivial wiring/accessors,
  framework behavior, or checking a default fixture's values.
- Use factual present-tense `describe`/`it` descriptions. Keep tests alongside
  the subject in its `tests/` folder; prefer the existing canonical test file
  over splitting it by an incidental concern.
- Use `aFake...With(overrides?)` factories and typed fakes; mock injected services,
  not internal methods, and prefer `vi.spyOn` to `vi.mock` where possible.
  Avoid ad hoc or inline service doubles; add a typed fake in `fakes/` if needed.
- Type mocks with `vi.fn<T>()` and spy handles with
  `MockInstance<typeof target.method>`. Use `expect.assertions(n)` when
  assertions occur inside conditionals or loops. Avoid `as unknown as` except
  for test global stubs where required.
- API route tests use `createApiRouter()` and `installFakeServicesWith({ env })`;
  Durable Object tests use `aFakeIndividualTrackerDOWith()` and
  `FakePreparedStatement`.
- Pages presenter tests construct the store and presenter directly, drive the
  public API, and assert on snapshots. Component tests use Testing Library and
  may mock icons/providers; proxy client tests spy on `globalThis.fetch`.
- Run the smallest existing checks covering the change, then the feature
  completion pipeline required by the repository workflow. Never run the
  prohibited whole-repository lint commands listed in `AGENTS.md`.
