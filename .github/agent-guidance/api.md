# API and shared architecture ([root guidance](../../AGENTS.md))

- `api/worker.ts` exports the Sentry-wrapped Worker and Durable Object classes.
  `api/server.ts` registers named `RoutesRegisterHandler` functions on an
  `itty-router` AutoRouter.
- `api/services/install.ts` creates services per request with
  `installServices({ env })`; route tests use `installFakeServicesWith`.
- Shared Zod contracts in `shared/src/contracts/` use `defineContract()` for `parse`, `safeParse`,
  `fromResponse`, and `toResponse`. Import across workspaces via
  `@guilty-spark/shared/...` package entrypoints, never relative paths.
- `POST /api/stats/series-details/:seriesId` optionally accepts `configuredTeamContext`
  (ordered teams, Xbox-only association projection, timestamped substitutions) for
  display orientation, not authority or credentials. Omit it for generic/manual
  series; do not combine it with `teamMappingMode`. Unresolved orientation retains
  raw match identities and makes team-aligned aggregation explicitly unavailable.
- `IndividualTrackerDO` uses WebSocket hibernation, alarms, and persisted state;
  its IDs derive from `${userId}:${trackerId}`. D1 schema is in
  `api/services/database/schema.sql`, with row types under `types/`.
- The browser-facing `GET /proxy/halo-infinite/:operation` is allowlisted,
  GET-only, and edge-cached; its client is
  `@guilty-spark/shared/halo/halo-infinite-client-proxy`.
- Halo calls can hit HTTP 429s. Inspect the SDK and request path, including
  `api/services/halo/resilient-fetch.ts`, before adding concurrency or retry
  mechanisms. Preserve retries, honor `Retry-After` when present, and consider
  bounded or sequential requests; don't assume headers or duplicate coordination.
- When changing Worker environment bindings, regenerate types with
  `npx wrangler types` in both `api/` and `pages/` rather than editing generated
  declarations by hand. Never read secret files; if generation would expose or
  require reading them, ask the user to run it.
