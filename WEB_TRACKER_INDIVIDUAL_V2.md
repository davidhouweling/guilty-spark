# Web Individual Tracker v2 Proposal

**Status**: Active proposal — Phase 2 complete (backend), Phase 3 architecture revised
**Date**: April 7, 2026

## Goal

Build an authenticated individual tracker where users sign in with Microsoft, start and control their own live tracker, and persist profile settings in D1 while a dedicated Durable Object owns active live-tracker runtime state. The same authenticated user model and viewer model should be reusable for a future Twitch extension.

## Product Direction

### Core user flow

1. User opens the tracker page.
2. User signs in with Microsoft OAuth (PKCE).
3. User selects a profile and confirms the Xbox identity or gamertag to track, defaulting to their linked gamertag.
4. User starts an individual live tracker backed by a dedicated Durable Object.
5. The tracker continues polling without requiring the browser to stay open.
6. User adds or removes games while the live tracker is active.
7. User customizes streamer presentation and chooses which active tracker is currently presented on stream.
8. User returns later and sees persisted profile state and current tracker status.

### Long-term user flow (Twitch extension)

1. Signed-in user links Discord identity.
2. Signed-in user links Twitch account.
3. Extension reads the same tracker state and streamer view preferences.
4. Streamer controls update in one place; Twitch extension reflects updates.

### Relationship to existing live tracker

- The existing Durable Object should remain focused on NeatQueue-orchestrated tracking and should be treated as the NeatQueue live tracker.
- Individual live tracking should be reintroduced as a separate Durable Object type with separate routes, state, and authorization rules.
- If an individual tracker is following a NeatQueue series, it should be able to augment its presentation using NeatQueue grouping data.
- Longer term, tournament-style tracking can reuse the same grouping concepts without forcing the individual tracker to share the NeatQueue Durable Object.

## Architecture (v2)

### Frontend responsibilities

- Authenticate the user and bootstrap session state.
- Start and stop individual live trackers.
- Choose the tracked gamertag or linked Xbox identity, defaulting to the signed-in user's linked identity.
- Send editor mutations for add/remove game actions while the tracker is active.
- Render live state from the individual Durable Object and persisted settings from D1.

### Worker responsibilities

- Handle Microsoft OAuth callback and app session cookies.
- Authorize browser control-plane requests using session cookies.
- Persist per-user profiles, linked identities, idle-timeout settings, and streamer settings in D1.
- Resolve which active tracker is the current on-stream tracker for viewer routes.
- Expose authenticated control endpoints and read-only viewer endpoints.
- Ensure any new routes are also added to the Wrangler route configuration.

### Individual Durable Object responsibilities

- Own the active live tracker for one individual tracker instance.
- Poll Halo Infinite using the signed-in user's stored credentials.
- Maintain active runtime state, match discovery state, and viewer websocket broadcast state.
- Enforce tracker ownership for control-plane mutations.
- Stop on explicit user request or when no new matches are discovered inside the configured idle-timeout window.

### Shared Durable Object logic

- Common logic between the NeatQueue live tracker and the individual live tracker (alarm scheduling, WebSocket hibernation, error backoff, match enrichment, state broadcast) should be extracted into a base Durable Object class within the `api` package.
- Moving logic into the `shared` package is only appropriate if it would also be consumed by the `pages` website or another package. Base DO class inheritance within `api` is preferred because both DOs are colocated and share the same runtime context.

### State authority

- D1 is the persisted source of truth for profile information and settings that should survive tracker restarts.
- The individual Durable Object is the source of truth for active live tracker runtime state.
- Viewer clients are read-only consumers of the Durable Object state.
- Editor mutations flow through authenticated worker routes and then into the owning Durable Object.

### Data model (new)

- `user_sessions` (session id, user id, expiry, auth metadata)
- `linked_identities` (user id, xbox xuid/gamertag, optional twitch id, optional discord id)
- `individual_tracker_profiles` (profile id, user id, active identity, name, idle timeout preference, logout behavior preference)
- `individual_tracker_games` (profile id, match id, position, included/excluded, annotations)
- `streamer_view_settings` (profile id, layout options, visible sections, style flags)

Use D1 for persistent relational data. Keep tokens and session secrets server-only. Use the individual Durable Object's own storage only for active tracker runtime data that should remain colocated with the object.

## Auth and security model

### Microsoft sign-in

- Use OAuth2 Authorization Code with PKCE.
- Exchange code on backend only.
- Store app session in secure, HttpOnly, SameSite cookie.
- Use the signed-in user's stored access and refresh tokens for individual tracker Halo API calls.

### Proxy hardening

- Keep worker-to-worker token path for internal calls.
- Add browser-session authorization path for web UI.
- Enforce allowlist of proxied Halo methods/routes.
- Validate payload shapes and size limits.
- Add rate limits per user/session.
- Add audit logs for proxied calls and tracker mutations.

### Ownership rules

- Users can mutate only their own tracker profiles.
- Users can start, stop, or augment only their own active individual trackers.
- Read-only share links are separate from editor permissions.
- Viewer websocket connections are read-only and cannot issue control mutations.
- Twitch extension reads only profiles explicitly linked by the owner.
- An individual live tracker should be able to continue after logout only if the profile setting explicitly allows it.

## API contract

### Auth

- [x] `GET /auth/microsoft/start`
- [x] `GET /auth/microsoft/callback`
- [x] `POST /auth/logout`
- [x] `GET /auth/session`
- [ ] `GET /auth/discord/start`
- [ ] `GET /auth/discord/callback`
- [ ] `GET /auth/twitch/start`
- [ ] `GET /auth/twitch/callback`

### Identity linking

- [ ] `GET /api/identities`
- [ ] `POST /api/identities/link`
- [ ] `POST /api/identities/unlink`

#### Proposed payloads

- `POST /api/identities/link` request:

```json
{
  "provider": "discord",
  "providerUserId": "123456789012345678",
  "displayName": "player-discord-name",
  "metadata": {
    "guildId": "987654321098765432"
  }
}
```

- `POST /api/identities/link` response:

```json
{
  "success": true,
  "identity": {
    "identityId": "idn_01H...",
    "provider": "discord",
    "providerUserId": "123456789012345678",
    "isActive": true
  }
}
```

- `POST /api/identities/unlink` request:

```json
{
  "identityId": "idn_01H..."
}
```

- `GET /api/identities` response:

```json
{
  "identities": [
    {
      "identityId": "idn_01H...",
      "provider": "xbox",
      "providerUserId": "2533274923456789",
      "displayName": "ExampleGamertag",
      "isActive": true
    },
    {
      "identityId": "idn_01J...",
      "provider": "discord",
      "providerUserId": "123456789012345678",
      "displayName": "player-discord-name",
      "isActive": false
    }
  ]
}
```

### Individual tracker profile

- [x] `GET /api/individual-tracker/profile`
- [x] `POST /api/individual-tracker/profile`
- [x] `PATCH /api/individual-tracker/profile`

### Individual live tracker control

> All control-plane routes require a valid session cookie. The session user ID must match the profile owner.

- [ ] `POST /api/individual-live-tracker/start` — create a new active tracker for the signed-in user; resolves XUID from the linked identity; returns a `trackerId`
- [ ] `POST /api/individual-live-tracker/:trackerId/stop` — stop a specific active tracker owned by the signed-in user
- [ ] `GET /api/individual-live-tracker/status` — list all active tracker instances for the signed-in user
- [ ] `POST /api/individual-live-tracker/select-active` — mark one tracker as the current on-stream presenter
- [ ] `POST /api/individual-live-tracker/:trackerId/games:add` — add a past match into the active tracker
- [ ] `POST /api/individual-live-tracker/:trackerId/games:remove` — remove a match from the active tracker

#### Proposed start request

```json
{
  "profileId": "prof_01H...",
  "gamertag": "OptionalOverride",
  "searchStartTime": "2026-04-11T09:00:00Z"
}
```

> If `gamertag` is omitted, the tracker uses the gamertag from the profile's active linked identity. `searchStartTime` defaults to the current time if omitted.

#### Proposed start response

```json
{
  "trackerId": "trk_01H...",
  "gamertag": "ResolvedGamertag",
  "status": "active",
  "viewerUrl": "/individual-tracker/userId123/trk_01H..."
}
```

#### Durable Object ID scheme

Each individual live tracker is addressed as `userId:trackerId`, where:

- `userId` is the Microsoft user ID from the session.
- `trackerId` is a UUID created at start time and stored in D1 against the profile.

This means each tracker instance is globally unique and scoped to the owning user. Viewers can address a specific tracker directly, or use the stable `active` viewer route which resolves via D1.

Maximum 5 concurrent active trackers per user. New start requests beyond this limit must return a 429 with a clear error message.

### Game selection controls (profile)

- [x] `POST /api/individual-tracker/games:add`
- [x] `POST /api/individual-tracker/games:remove`
- [x] `POST /api/individual-tracker/games:reorder`

> Note: individual tracker presentation is time-linear by default. Manual reordering is not part of the revised product direction and can be deprecated in a later cleanup phase.

### Streamer view controls

- [ ] `GET /api/individual-tracker/streamer-view`
- [ ] `PATCH /api/individual-tracker/streamer-view`

### Halo proxy

- [x] `POST /proxy/halo-infinite` — session-authenticated for browser, token-authenticated for internal callers

### Viewer routes

> Viewer routes are public and require no authentication. The UI is statically rendered with client-side hydration. If no active tracker exists, the client displays an informational message.

- [ ] `GET /ws/individual-tracker/:userId/:trackerId` — WebSocket for a specific active tracker
- [ ] `GET /ws/individual-tracker/:userId/active` — WebSocket that resolves to the current on-stream tracker
- [ ] `GET /api/individual-live-tracker/:userId/active` — REST status of the current on-stream tracker (for initial render before WebSocket upgrade)

## UI plan

### Phase A: signed-in tracker shell

- [x] Dedicated login page and session bootstrap.
- [ ] Basic profile selector and gamertag binding.
- [ ] Tracker page loads from saved profile.
- [ ] Start tracker flow defaults to the linked gamertag but allows searching another gamertag.
- [ ] Idle-timeout setting is visible in profile settings.
- [ ] Logout warning is shown when active trackers exist and the profile is not configured to allow them to continue.

> Note: Individual tracker page is currently a placeholder pending Phase 3 kickoff discussion.

### Phase B: editable game list

- [ ] Add previous games into the active tracker by search result or match id.
- [ ] Remove games from the active tracked timeline.
- [ ] Keep games in time-linear order.

### Phase C: streamer controls

- [ ] Toggle sections (scoreboard, medals, timeline, player cards).
- [ ] Save layout preferences.
- [ ] Add a stable `follow the stream` URL that resolves to the user's currently active on-stream tracker.
- [ ] Allow the owner to switch which active tracker is currently presented on stream.

### Phase D: Twitch extension readiness

- [ ] Add Discord link flow and ownership verification.
- [ ] Add Twitch link flow and ownership verification.
- [ ] Provide extension-safe read endpoint and short-lived viewer tokens.
- [ ] Reuse existing streamer view profile without duplicating settings.

### Phase E: viewer discovery

- [ ] Add an `active tracker` viewer page that follows the current on-stream tracker automatically.
- [ ] Add a way for viewers to explore other active trackers for the streamer.
- [ ] Keep this separate from the first viewer-mode implementation.

## Delivery phases

### Phase 1 - Foundation

- [x] Microsoft Entra app registration and environment variables configured.
- [x] Microsoft OAuth + PKCE auth service (`MicrosoftAuthService`, `SessionManager`, `AuthService`).
- [x] Session signing with HMAC-SHA256 and secure HttpOnly cookie.
- [x] `GET /auth/microsoft/start` endpoint (returns auth URL).
- [x] `GET /auth/microsoft/callback` endpoint (exchanges code, sets session cookie).
- [x] `POST /auth/logout` endpoint (clears session cookie).
- [x] `GET /auth/session` endpoint (returns current session user).
- [x] Session-aware `/proxy/halo-infinite` (accept session cookie in addition to worker token).
- [x] Initial D1 schema defined (`user_sessions`, `linked_identities`) and ready for manual execution.

### Phase 2 - Tracker profile CRUD

- [x] `individual_tracker_profiles` D1 schema defined and ready for manual execution.
- [x] `individual_tracker_games` D1 schema defined and ready for manual execution.
- [x] Create/read/update profile endpoints.
- [x] Persist selected/removed games.
- [ ] FE integration with optimistic updates — removed; pending Phase 3 kickoff.

### Phase 3 - Individual live tracker architecture and UX alignment

- [ ] Confirm auth/login page UX and post-login redirect behavior across routes.
- [ ] Reintroduce a separate individual live tracker Durable Object.
- [ ] Add authenticated start/stop/status routes for individual live trackers.
- [ ] Ensure individual live trackers use the signed-in user's Halo credentials rather than the default shared live-tracker credentials.
- [ ] Confirm active tracker routing model: per-tracker route plus stable follow-the-stream route.
- [ ] Re-implement individual tracker page UI around active live tracker control and time-linear game augmentation.
- [ ] Add idle-timeout settings with allowed values of 1h, 2h, 3h, 4h, 5h, and 6h, defaulting to 1h.
- [ ] Add logout behavior setting for whether active trackers may continue after logout.
- [ ] Stop trackers automatically only when no new matches are discovered within the configured window.
- [ ] Integrate NeatQueue grouping metadata when the active tracker corresponds to a NeatQueue series.

### Phase 4 - Streamer controls

- [x] `streamer_view_settings` D1 schema defined and ready to execute manually.
- [ ] Streamer-view settings API + UI.
- [ ] URL/share behavior for live stream usage.
- [ ] Allow the owner to select which active tracker is presented on stream.

### Phase 5 - Twitch extension integration

- [ ] Discord account linking.
- [ ] Twitch account linking.
- [ ] Extension read endpoints and access controls.
- [ ] Operational monitoring and abuse protection.

### Phase 6 - Auto start and stop exploration

- [ ] Explore Twitch live webhook integration as an optional auto-start and auto-stop trigger.
- [ ] Explore whether Discord activity or presence can be used as a reliable Halo Infinite signal.
- [ ] Confirm how automated lifecycle events should interact with manual start and stop controls.
- [ ] Keep this phase separate from the initial manual-control implementation.

### Phase 7 - Viewer discovery and multi-tracker browsing

- [ ] Add follow-the-stream viewer landing experience.
- [ ] Add exploration of other active trackers owned by the streamer.
- [ ] Confirm permissions and visibility rules for non-active trackers.

## Non-goals for initial kickoff

- DO-to-DO subscriptions for individual mode.
- Reusing the existing NeatQueue live tracker Durable Object for individual tracking.
- Reintroducing `/ws/tracker/individual/:gamertag`.

## Cleanup status

Legacy individual-web-tracker cleanup is complete.

- [x] Removed pages individual-mode rendering path built around `type: "individual"` live state.
- [x] Removed tracker-initiation flow that depended on removed endpoints (`/api/tracker/individual/*`).
- [x] Simplified shared live tracker contracts by removing individual union variants not used by team tracker.
- [x] Removed fake scenarios/data dedicated to old individual WebSocket mode.

## Gaps identified (implementation audit — April 9, 2026)

### Identity linking API — not started

- [ ] `GET /api/identities` — not wired in server routes.
- [ ] `POST /api/identities/link` — not wired in server routes.
- [ ] `POST /api/identities/unlink` — not wired in server routes.

> D1 schema and `DatabaseService` methods for `LinkedIdentities` exist. Service and route layer still needed.

### Streamer view API — not started

- [ ] `GET /api/individual-tracker/streamer-view` — not wired in server routes.
- [ ] `PATCH /api/individual-tracker/streamer-view` — not wired in server routes.

> D1 schema and `DatabaseService` methods for `StreamerViewSettings` exist. Service and route layer still needed.

### Proxy allowlist hardening — partial

- [ ] Halo proxy currently invokes any existing `HaloInfiniteClient` method by name dynamically. An explicit allowlist of permitted methods is not enforced.
- [ ] Rate limiting per user/session is not implemented.
- [ ] Audit logging for proxied calls and tracker mutations is not implemented.

### Individual live tracker Durable Object — not started

- [ ] Dedicated individual Durable Object type is not implemented.
- [ ] Authenticated individual start/stop/status routes are not wired.
- [ ] Viewer routes for follow-the-stream and direct active tracker viewing are not wired.
- [ ] Ownership checks between profile, tracker instance, and controlling user are not wired.

### Discord / Twitch auth flows — not started

- [ ] `GET /auth/discord/start` — not wired.
- [ ] `GET /auth/discord/callback` — not wired.
- [ ] `GET /auth/twitch/start` — not wired.
- [ ] `GET /auth/twitch/callback` — not wired.

## Open decisions (to finalize before implementation)

- [x] Profile model: keep multiple named profiles, with one active or default selected in service logic.
- [x] Separate Durable Object: reintroduce individual live tracking as a dedicated Durable Object, keeping the current live tracker focused on NeatQueue orchestration.
- [x] Ordering model: keep games in time-linear order; do not design around user-driven reorder in the new UI.
- [x] Mutation transport: use authenticated HTTP routes for editor mutations and websocket for read-only live updates.
- [x] Idle timeout: stop only when no new match has been discovered inside the configured timeout window.
- [x] Logout behavior: active trackers stop on logout by default. If the user's profile setting explicitly allows trackers to continue after logout, they are kept alive using the server-side stored refresh token. The logout flow warns the user if active trackers exist and the setting is not enabled, and asks whether to stop them or let them continue.
- [x] Viewer URL behavior: viewer pages are statically rendered with client-side hydration. If no active tracker exists for the requested streamer, the client displays an informational message. No server-side page rendering or routing decision is needed per tracker state.
- [ ] Twitch auth flow timing (Phase 4.5 vs Phase 5).
- [x] Linked identities: enforce at most one active Xbox identity per user at DB level.

## Kickoff checklist

- [x] Confirm API contract and route naming for individual live tracker endpoints.
- [x] Confirm Durable Object ID scheme: `userId:trackerId`, maximum 5 concurrent per user.
- [x] Confirm first DB schema (defined, reviewed, and ready to execute manually).
- [x] Confirm session cookie and CSRF strategy (HMAC-SHA256 signed payload, HttpOnly, Secure, SameSite=Strict).
- [x] Confirm frontend and Durable Object state ownership boundaries.
- [x] Confirm shared DO logic lives in a base class within the `api` package.
- [x] Start implementation with Phase 1.
