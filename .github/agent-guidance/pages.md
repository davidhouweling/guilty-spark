# Pages architecture and conventions ([root guidance](../../AGENTS.md))

## Composition and ownership

- Pages is a hybrid Astro site: most pages are prerendered; dynamic routes use
  `export const prerender = false` and `client:only="react"`. The `cockatiel`
  dependency needs the Vite alias in `pages/astro.config.ts`.
- App islands live in `pages/src/apps/`; those requiring real/fake installation
  use `services.ts` and `getMode()`. Fake/test modes select in-memory fakes,
  including `pages/src/services/fakes/`. Astro passes `apiHost={API_HOST}` as needed.
- Before introducing a service, check whether an existing service already owns
  the responsibility. Extend it when appropriate rather than duplicating a
  client and its wiring. A new Pages service belongs in its own
  `pages/src/services/<service-name>/` folder, colocating types, installer,
  fakes, and tests as applicable. Do not reorganize unrelated legacy services.
- Stateful features use Store -> Presenter -> Component. The store holds state
  and publishes updates through `getSnapshot()` and `subscribe()`; it does not
  fetch or make business decisions, and only the presenter mutates it. The
  presenter owns business logic, async work, state transitions, and display-ready
  formatting, including URLs, colours, sorted arrays, and computed strings. Its
  `present(snapshot)` is pure. The view renders named props without logic or
  utility calls.
- Presenters are class-based by default, associated one-to-one with their
  component/store, and expose a small intentional API. Put shared setup in the
  constructor and shared presenter helpers in private methods.
- Do not pass presenters to or construct presenters inside other presenters.
  Put genuinely shared logic in a controller, create it at the appropriate
  composition boundary, and inject it. Keep component-specific logic in its
  presenter; do not introduce a controller merely to move unshared logic.
- Views receive specific named props, not a generic `model` or raw contract
  types. `create.tsx` maps presenter output to props; spreading a display-ready
  model is idiomatic. `useMemo` in a view is only for pure view-layer concerns
  such as column definitions, not data transformation.
- Types shared by a presenter and its view live in their sibling `types.ts`;
  neither imports types from the other.

## Create entry points and lifecycle

- Every `pages/src/components/**/create.tsx` exports a `create*` factory rather
  than a direct wiring component. The factory can close over stable service,
  environment, and static configuration and returns a renderable component.
- Create disposable stores, presenters, controllers, and subscriptions per
  mount inside the returned component, not as factory-scoped singletons.
  Consumers normally memoize the returned component at the mount boundary.
- Construct and inject collaborators with compatible lifetimes; dependency
  replacement and remounts must not reuse a disposed collaborator. Follow
  existing disposal ownership. Wire `start()`/`dispose()` in effects where
  applicable; guard state updates after awaits or errors against disposal.
- Tests instantiate factory-created components per test or `beforeEach`.
  Migrations must verify factory API shape, remount safety, and lifecycle-sensitive
  paths.

## Components and styling

- Keep one key component per file. Extract a non-trivial subcomponent into a
  sibling feature folder with its own tests. If components share a file, define
  subcomponents before their parent.
- Name view files after the exported component without a `-view` suffix. Declare
  React props as required data, optional data, required callbacks, then optional
  callbacks; destructure in the same order.
- Use CSS Modules and `classnames` for conditional classes, never template-literal
  class strings. Only use `style` for CSS variables with dynamic values.
- Use mobile-first PostCSS custom media from `pages/src/styles/variables.css`:
  `--tablet-viewport` (750px), `--desktop-viewport` (1000px), and
  `--ultrawide-viewport` (1200px). Do not use `max-width` queries.
- Match list/detail data by stable identifiers rather than positions. Memo
  comparators must include every render-affecting prop. Normalize display values
  such as empty subtitles in the presenter/create layer.
