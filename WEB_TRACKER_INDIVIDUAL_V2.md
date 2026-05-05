# Web Individual Tracker v2 Proposal

**Status**: Active implementation — Phase 1 and Phase 2 complete, Phase 3 core delivered including NeatQueue pre-series fanout; Phase 4 design clarified and implementation work queued
**Date**: April 7, 2026 (UX decisions recorded: April 12, 2026; implementation snapshot updated: May 4, 2026)

## Current implementation snapshot (May 4, 2026)

- Shared `match-history` component is implemented and reused by both Add Tracker and Game Selection flows.
- Live tracker row actions are wired end-to-end for pause, resume, stop, delete, set-live, and game-selection sync.
- The current "Streamer Connections" panel remains a placeholder and is planned to become "Streamer Settings" for the Phase 4 overlay/view work.
- Per-tracker Streamer Settings action is present but intentionally disabled pending Phase 5 integration.
- Viewer-mode behavior is now wired for tracker-specific viewing and follow-active viewing: `?tracker=` and `?mode=active` routes render a dedicated read-only tracker panel backed by explicit status fetch + WebSocket updates.
- Individual tracker manager/public transitions now use client-side routing for `/individual-tracker`, `/individual-tracker/:xuid/view`, and `/individual-tracker/:xuid/overlay` inside the app shell, avoiding full-page reloads when navigating from Streamer Settings open actions.
- Shared series-overview UI is now extracted into a reusable component and consumed by both team live-tracker and individual tracker viewer surfaces.
- Individual tracker grouped-series presentation now supports dropping inner borders around score/team blocks for closer visual parity with the target viewer UX.
- Individual tracker viewer derivation now lives in a presenter-side render-model builder so the viewer component is primarily presentational.
- Raw viewed-tracker and viewed-match-history data are now presenter-private implementation details; the public snapshot exposes only loading/connection state plus the derived viewer render model.
- Historical gameplay ordering is covered by focused render-model tests to keep grouped series and standalone matches in chronological order.
- Active tracker game selection now syncs through a single bulk request that updates tracker membership atomically and persists manual match groupings into DO state for viewer mode.
- Viewer header metadata now reuses the same rank / peak / game-count summary UI as the Add Tracker search flow rather than showing a low-value tracker ID.
- Grouped-series score derivation now follows Halo team-index ordering and uses raw match stats when available, with focused regression coverage for the previously mismatched `1:2` style cases.
- Individual tracker DO alarm handling now has focused test coverage and follows the same lock-clearing / rescheduling pattern as the NeatQueue live tracker more closely.
- NeatQueue integration now fans out active-series metadata to matching individual tracker DOs on `TEAMS_CREATED` and `SUBSTITUTION` events using XUID overlap.
- Individual tracker viewer now renders an active pre-series section (shared series overview, pre-series player info, substitutions) before grouped matches exist, and clears active-series state on series completion.

## Goal

Build an authenticated individual tracker where users sign in with Microsoft, start and control their own live tracker, and persist profile settings in D1 while a dedicated Durable Object owns active live-tracker runtime state. The same authenticated user model and viewer model should be reusable for a future Twitch extension.

## Related Design Docs

- [USER_TOKEN_DURABLE_OBJECT_ARCHITECTURE.md](USER_TOKEN_DURABLE_OBJECT_ARCHITECTURE.md) — token handling for both interactive tracker starts and future unattended Twitch auto-start.

Token strategy summary used by this proposal:

- Interactive/manual start: pass session-derived user tokens into the DO runtime.
- Future unattended auto-start: use durable encrypted server-side token storage with refresh-on-demand.

## Product Direction

### Core user flow

1. User opens the tracker page.
2. User signs in with Microsoft OAuth (PKCE).
3. User selects a profile and confirms the Xbox identity or gamertag to track, defaulting to their linked gamertag.
4. User starts an individual live tracker backed by a dedicated Durable Object.
5. The tracker continues polling without requiring the browser to stay open.
6. User adds or removes games while the live tracker is active.
7. User customizes one persistent streamer presentation keyed to their Xbox XUID and chooses which active tracker is currently presented on stream.
8. User returns later and sees persisted profile state and current tracker status.

### Long-term user flow (Twitch extension)

1. Signed-in user links Discord identity.
2. Signed-in user links Twitch account.
3. Extension reads the same tracker state and streamer view preferences.
4. Streamer controls update in one place; Twitch extension reflects updates.

### Relationship to existing live tracker

- The existing Durable Object should remain focused on NeatQueue-orchestrated tracking and should be treated as the NeatQueue live tracker.
- Individual live tracking should be reintroduced as a separate Durable Object type with separate routes, state, and authorization rules.
- If an individual tracker is following a NeatQueue series, it should be able to augment its presentation using NeatQueue grouping data, teams, player rosters, substitutions, and default series labels.
- NeatQueue-to-individual tracker coordination should be worker-mediated: the worker fans out normalized NeatQueue series lifecycle updates to matching individual tracker DOs based on XUID overlap.
- Longer term, tournament-style tracking can reuse the same grouping concepts without forcing the individual tracker to share the NeatQueue Durable Object.

## Architecture (v2)

### Frontend responsibilities

- Authenticate the user and bootstrap session state.
- Provide client-side routing for manager, active view, and overlay surfaces without full page reloads.
- Start and stop individual live trackers.
- Choose the tracked gamertag or linked Xbox identity, defaulting to the signed-in user's linked identity.
- Send editor mutations for add/remove game actions while the tracker is active.
- Render live state from the individual Durable Object and persisted settings from D1.
- Resolve XUID-scoped active view and overlay routes that always follow the user's currently active tracker.

### Worker responsibilities

- Handle Microsoft OAuth callback and app session cookies.
- Authorize browser control-plane requests using session cookies.
- Persist per-user profiles, linked identities, idle-timeout settings, and streamer settings in D1.
- Resolve which active tracker is the current on-stream tracker for viewer routes.
- Resolve XUID-based read-only view and overlay routes to the user's currently active tracker.
- Route NeatQueue series lifecycle updates to matching active individual tracker DOs based on player XUID overlap.
- Expose authenticated control endpoints and read-only viewer endpoints.
- Include effective streamer settings in the active-tracker payloads used by XUID-scoped view and overlay surfaces so active-tracker switches update presentation automatically.
- Ensure any new routes are also added to the Wrangler route configuration.

### Individual Durable Object responsibilities

- Own the active live tracker for one individual tracker instance.
- Poll Halo Infinite using the signed-in user's stored credentials.
- Maintain active runtime state, match discovery state, grouped-series runtime metadata, and viewer websocket broadcast state.
- Enforce tracker ownership for control-plane mutations.
- Stop on explicit user request or when no new matches are discovered inside the configured idle-timeout window.

### Shared Durable Object logic

- Common logic between the NeatQueue live tracker and the individual live tracker (alarm scheduling, WebSocket hibernation, error backoff, match enrichment, state broadcast) should be extracted into a base Durable Object class within the `api` package.
- Moving logic into the `shared` package is only appropriate if it would also be consumed by the `pages` website or another package. Base DO class inheritance within `api` is preferred because both DOs are colocated and share the same runtime context.

### State authority

- D1 is the persisted source of truth for profile information and settings that should survive tracker restarts.
- The individual Durable Object is the source of truth for active live tracker runtime state.
- Grouped-series labels and NeatQueue-derived series context are runtime-only DO state for the current tracker session and are intentionally discarded when the DO is stopped.
- Streamer view and overlay settings are persisted server-side in D1 and treated as part of the read model returned to active view / overlay clients.
- Viewer clients are read-only consumers of the Durable Object state.
- Editor mutations flow through authenticated worker routes and then into the owning Durable Object.

### Data model (new)

- `user_sessions` (session id, user id, expiry, auth metadata)
- `linked_identities` (user id, xbox xuid/gamertag, optional twitch id, optional discord id)
- `individual_tracker_profiles` (profile id, user id, active identity, name, idle timeout preference, logout behavior preference)
- `individual_tracker_games` (profile id, match id, position, included/excluded, annotations)
- `streamer_view_settings` (profile id, layout options, visible sections, style flags)

Runtime-only DO data for grouped series is intentionally out of scope for D1 persistence in this phase. That runtime data includes series membership, manual label overrides, NeatQueue-derived defaults, teams, players, and substitutions.

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

- [x] `GET /api/identities`
- [x] `POST /api/identities/link`
- [x] `POST /api/identities/unlink`

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

- [x] `POST /api/individual-tracker/manage/start` — create a new active tracker for the signed-in user; resolves XUID from the linked identity; returns a `trackerId`
- [x] `POST /api/individual-tracker/:trackerId/stop` — stop a specific active tracker owned by the signed-in user
- [x] `POST /api/individual-tracker/:trackerId/pause` — pause a specific active tracker (alarm suspended, DO remains resident)
- [x] `POST /api/individual-tracker/:trackerId/resume` — resume a paused tracker (re-enable alarm)
- [x] `GET /api/individual-tracker/manage/:userId/trackers` — list running tracker references for a user (trackerId + gamertag + updatedAt)
- [x] `GET /api/individual-tracker/manage/:userId/statuses` — batch status lookup for explicit tracker IDs (currently internal/client-service utility)
- [x] `GET /api/individual-tracker/:xuid/active` — resolve the current active tracker for a given XUID (public, no session dependency)
- [x] `GET /api/individual-tracker/manage/:userId/:trackerId/status` — resolve a specific tracker instance explicitly by identifier
- [x] `POST /api/individual-tracker/manage/select-active` — mark one tracker as the current on-stream presenter
- [x] `POST /api/individual-tracker/:trackerId/games:add` — add a past match into the active tracker
- [x] `POST /api/individual-tracker/:trackerId/games:remove` — remove a match from the active tracker
- [ ] `GET /api/halo/gamertag-search?q=<query>` — deferred; current manager flow already supports gamertag search via authenticated Halo proxy in pages service. Add only if we need dedicated server-side autocomplete behavior.

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

- [x] `GET /api/individual-tracker/streamer-view`
- [x] `PATCH /api/individual-tracker/streamer-view`

### Active view / overlay routes

> These routes are the Phase 4 replacement for the current query-param based active view flow. They are XUID-based, public, require no authentication, and always resolve to the user's currently active tracker.

- [x] `GET /individual-tracker/:xuid/view` — read-only active tracker view for sharing with viewers
- [x] `GET /individual-tracker/:xuid/overlay` — OBS-friendly active tracker overlay
- [x] `GET /api/individual-tracker/:xuid/active` — REST bootstrap for the currently active tracker and effective streamer settings
- [x] `GET /ws/individual-tracker/:xuid/active` — WebSocket that follows the currently active tracker for the user identified by XUID

### Halo proxy

- [x] `POST /proxy/halo-infinite` — session-authenticated for browser, token-authenticated for internal callers

### Viewer routes

> Viewer routes are public and require no authentication. The UI is statically rendered with client-side hydration. If no active tracker exists, the client displays an informational message.

- [x] `GET /ws/individual-tracker/:userId/:trackerId` — WebSocket for a specific active tracker
- [x] `GET /ws/individual-tracker/:xuid/active` — WebSocket that resolves to the current on-stream tracker by XUID
- [x] `GET /api/individual-tracker/:xuid/active` — REST status of the current on-stream tracker by XUID (for initial render before WebSocket upgrade)

## UI plan

### Phase A: signed-in tracker shell

- [x] Dedicated login page and session bootstrap.
- [ ] Basic profile selector and gamertag binding.
- [x] Tracker page loads from saved profile.
- [x] Start tracker flow defaults to the linked gamertag but allows searching another gamertag.
- [x] Idle-timeout setting is visible in profile settings.
- [ ] Logout warning is shown when active trackers exist and the profile is not configured to allow them to continue.

### Phase B: editable game list

- [x] Add previous games into the active tracker by search result or match id.
- [x] Remove games from the active tracked timeline.
- [x] Keep games in time-linear order.

### Phase C: streamer controls

- [ ] Introduce a client-side router (React Router is acceptable) for `/individual-tracker`, `/individual-tracker/:xuid/view`, and `/individual-tracker/:xuid/overlay` so manager/view/overlay transitions do not full-refresh.
- [x] Rename "Streamer Connections" to "Streamer Settings" and move the overlay/view configuration into that section.
- [x] Add one stable XUID-based view URL and one stable XUID-based overlay URL that always resolve to the user's currently active on-stream tracker.
- [ ] Build the individual tracker streamer overlay by lifting the NeatQueue overlay model and extending it for matchmaking games and multiple series inside one session.
- [ ] Toggle sections and display modes for in-series vs not-in-series presentation.
- [ ] Save layout and color preferences server-side in D1 and include them in the active-tracker read model / WebSocket updates.
- [ ] Support player-view vs observer-view presentation, defaulting to player view when the tracked XUID is the owner's own account and observer view otherwise.
- [ ] Support global per-user overlay settings plus per-tracker observer-color overrides so a streamer can present another player's tracker with colors that match their own branding.
- [x] Add offline / not-found handling for the new XUID routes: `view` shows offline if the XUID is configured but has no active tracker, and not found if there is no configured XUID surface; `overlay` collapses to a minimal mostly-empty state with only the Guilty Spark mark visible.
- [x] Allow the owner to switch which active tracker is currently presented on stream.

### Phase D: Twitch extension readiness

- [ ] Add Discord link flow and ownership verification.
- [ ] Add Twitch link flow and ownership verification.
- [ ] Provide extension-safe read endpoint and short-lived viewer tokens.
- [ ] Reuse existing streamer view profile without duplicating settings.

### Phase E: viewer discovery

- [x] Add an `active tracker` viewer page that follows the current on-stream tracker automatically.
- [ ] Add a way for viewers to explore other active trackers for the streamer.
- [ ] Keep this separate from the first viewer-mode implementation.

> Current state: direct tracker viewer mode (`/individual-tracker?tracker=<trackerId>`) and owner follow-active mode (`/individual-tracker?mode=active`) are implemented for read-only viewing. Phase 4 now replaces those entrypoints for sharing/OBS with client-routed XUID-based `/individual-tracker/:xuid/view` and `/individual-tracker/:xuid/overlay` flows that follow the active tracker automatically.

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
- [x] FE integration for core tracker control delivered; optimistic updates were intentionally not adopted for this phase.

### Phase 3 - Individual live tracker architecture and UX alignment

- [x] Confirm auth/login page UX and post-login redirect behavior across routes.
- [x] Reintroduce a separate individual live tracker Durable Object.
- [x] Add authenticated start/stop/status routes for individual live trackers.
- [x] Ensure individual live trackers use the signed-in user's Halo credentials rather than the default shared live-tracker credentials.
- [x] Confirm active tracker routing model: per-tracker route plus stable follow-the-stream route.
- [x] Re-implement individual tracker page UI around active live tracker control and time-linear game augmentation.
- [x] Add idle-timeout settings with allowed values of 1h, 2h, 3h, 4h, 5h, and 6h, defaulting to 1h.
- [ ] Add logout behavior setting for whether active trackers may continue after logout.
- [x] Stop trackers automatically only when no new matches are discovered within the configured window.
- [x] Integrate NeatQueue series metadata when the active tracker corresponds to a NeatQueue series, including grouped-series defaults, teams, pre-series player info, and substitutions.

> Current Phase 3 state: the core individual tracker runtime and owner-facing manage/view experience are delivered, including NeatQueue grouped-series and active pre-series metadata fanout. The remaining Phase 3 backlog is limited to auth/logout UX polish.

### Phase 4 - Streamer controls

- [x] `streamer_view_settings` D1 schema defined and ready to execute manually.
- [x] Streamer-view settings API.
- [x] Initial viewer settings UI for team/enemy colors in Additional Options.
- [x] Client-side router for manager/view/overlay flows without page reloads.
- [x] Broader streamer-view layout/preferences UI in the renamed Streamer Settings section.
- [x] Stable XUID-based active view and overlay URLs for live stream usage.
- [x] OBS overlay implementation for individual trackers, including series-aware and non-series session modes.
- [x] Allow the owner to select which active tracker is presented on stream.

> Current Phase 4 state: backend schema/API work, owner-side live-tracker selection, streamer settings URL controls, server-backed streamer presentation defaults, client-side routed manager/view/overlay transitions, and OBS-ready overlay behaviors (series/non-series + player/observer + section toggles) are in place. Remaining backlog focuses on per-tracker observer-color override UX.

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
- [ ] Implement refresh-on-demand server-side token broker for unattended starts (cron optional for UX only, not required for correctness).

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

### Identity linking API — implemented

- [x] `GET /api/identities` — wired in server routes.
- [x] `POST /api/identities/link` — wired in server routes.
- [x] `POST /api/identities/unlink` — wired in server routes.

> Uses existing D1 schema and `DatabaseService` linked-identity methods.

### Streamer view API — implemented

- [x] `GET /api/individual-tracker/streamer-view` — wired in server routes.
- [x] `PATCH /api/individual-tracker/streamer-view` — wired in server routes.

> Uses existing D1 schema and `DatabaseService` `StreamerViewSettings` methods with profile ownership checks.

### Proxy allowlist hardening — partial

- [x] Halo proxy now enforces an explicit allowlist of permitted `HaloInfiniteClient` methods.
- [ ] Rate limiting per user/session is not implemented.
- [ ] Audit logging for proxied calls and tracker mutations is not implemented.

### Individual live tracker Durable Object — implemented

- [x] Dedicated individual Durable Object type is implemented.
- [x] Authenticated individual start/stop/status routes are wired.
- [x] Viewer routes for follow-the-stream and direct active tracker viewing are wired.
- [x] Ownership checks between profile, tracker instance, and controlling user are wired.

### Discord / Twitch auth flows — not started

- [ ] `GET /auth/discord/start` — not wired.
- [ ] `GET /auth/discord/callback` — not wired.
- [ ] `GET /auth/twitch/start` — not wired.
- [ ] `GET /auth/twitch/callback` — not wired.

## Phase 3 UX rework decisions (April 12, 2026)

### Information architecture — three sections

The individual tracker page is rebuilt around three left-nav sections (two-column split shell):

1. **Live Trackers** — "Track your Halo Infinite matches in real time." — Shows the tracker list and all tracker controls.
2. **Streamer Settings** — "Configure the active viewer and OBS overlay for your stream." — overlay/view URLs, player-vs-observer presentation, colors, layout, and later Twitch integration.
3. **Additional Options** — "Fine-tune how your trackers behave." — Offline continuation, show stopped trackers toggle, etc.

### Tracker list layout and ordering

- The user's own linked Xbox gamertag is always the **first row** and cannot be deleted. It is pinned as the default ownership tracker.
- Remaining trackers are sorted alphabetically by gamertag after the pinned row.
- If no linked Xbox identity exists (rare edge case), the pinned row is omitted; the "Add tracker" button has no prefilling.
- When the list is empty (no pinned row and no trackers), an information panel below the empty list explains how individual tracking works.

### Tracker states

Three valid states stored per tracker in D1:

| State     | DO alive | Notes                                                                                                                                                       |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `active`  | Yes      | Alarm fires normally. DO polls Halo Infinite.                                                                                                               |
| `paused`  | Yes      | Alarm does **not** re-execute while paused. DO stays resident. A WebSocket message is broadcast to clients on pause. UI shows auto-stop countdown (max 6h). |
| `stopped` | No       | DO is hard-deleted. Tracker entity and configuration remain in D1 so the user can restart with default empty runtime.                                       |

- The tracker list in D1 (`individual_tracker_profiles`) is the persistent source of truth for tracker metadata; the DO holds only active runtime state.
- Stopped trackers are hidden from the list by default. An **Additional Options** toggle ("Show stopped trackers", default: off) reveals them.

### Live tracker selection

- There is always **exactly one** "live" tracker when at least one tracker exists. The live tracker is the one whose output is presented on stream and linked to the stable viewer URL.
- If there is only one tracker, it is implicitly live — the "Set as live" action is hidden.
- When multiple trackers exist, a **Live** badge is shown next to the current live tracker. The ellipsis menu for non-live trackers includes a "Set as live" option.

### Add tracker dialog

- Opened via "Add tracker" button in the top-right of the Live Trackers panel.
- **No prefilling** — the user's gamertag tracker is already pinned, so this is always for a additional tracker.
- Dialog sections (mirroring existing settings dialog UX):
  1. **Gamertag** — search input with autocomplete (leverages Xbox gamertag search endpoint if available, otherwise exact-match). Results show a lightweight service-record preview (similar to the service record embed: avatar, gamertag, rank/CSR, win/loss). Selecting a result binds the gamertag.
  2. **Game history** (optional, labelled "Optional — can be skipped") — shows the most recent 25 matches with checkboxes. "Load more" button fetches the next 25. Unchecked by default; user checks games to pre-load into tracker state. Skipping leaves the tracker starting with empty state.
  3. Footer button: **"Start tracker"**.

### Tracker row actions (ellipsis menu)

Each row shows: gamertag being tracked, status badge (active / paused / stopped), Live badge (if live), and an ellipsis menu.

| Action            | Availability                                             | Behaviour                                                                                                 |
| ----------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Set as live       | Only when >1 tracker exists and this tracker is not live | Marks this tracker as the on-stream presenter                                                             |
| View              | Always                                                   | Routes to `/individual-tracker?tracker=<trackerId>` in viewer mode                                        |
| Pause             | Active only                                              | Pauses alarm execution; broadcasts paused state via WebSocket. Paused auto-stops after 6h (configurable). |
| Resume            | Paused only                                              | Re-enables alarm; broadcasts active state                                                                 |
| Stop              | Active or paused                                         | Hard-stops DO, clears runtime state. Configuration survives in D1.                                        |
| Delete            | Always                                                   | Removes tracker from D1 entirely. Confirmation required. Pinned gamertag tracker cannot be deleted.       |
| Game selection    | Active only                                              | Opens game-selection dialog (see below)                                                                   |
| Streamer settings | Always                                                   | Opens streamer settings dialog scoped to this tracker (inherits global, allows overrides)                 |

### Game selection dialog (active trackers only)

- Shows the game type filters: **Matchmaking**, **Custom**, **Local**.
- Shows the account's match history (recent 25, "Load more" for next 25).
- Games already in the tracker state are **pre-checked**; games not in state are unchecked.
- On dialog close, the selection is **synced** as a 1:1 mapping: newly checked games are added to state, unchecked games that were previously checked are removed. This is applied as a single atomic mutation.

### Grouped series metadata

- Each grouped series inside an active individual tracker can have its own **title** and **subtitle**.
- These labels are attached to the grouped-series runtime object, not the tracker as a whole.
- Labels persist only for the lifetime of the current individual tracker DO session. If the DO stops, the grouped-series labels are discarded.
- Default labels depend on the source of the grouped series:
  - Manual / heuristic grouped series default to `Eagle vs Cobra` and `Best of X`, where `X` is `matchIds.length`.
  - NeatQueue-backed grouped series default to NeatQueue-derived metadata when available.
- Users can edit the labels inline from the viewer surface; the edit affordance is an icon that turns the title/subtitle strings into text inputs.
- Label identity is tied to the grouped-series object. If grouping changes materially, the label follows the resulting grouped-series object rather than acting as a tracker-global setting.

### Streamer settings

- The owner configures streamer settings from the page-level **Streamer Settings** section rather than a modal-only overlay flow.
- The system exposes one stable view URL and one stable overlay URL per Xbox XUID; both always follow the user's currently active tracker.
- Streamer settings are persisted server-side in D1 and delivered as part of the active-tracker read model / WebSocket sync so overlay presentation updates automatically when the active tracker changes.
- Settings scope is global per user, with per-tracker overrides limited to observer-view colors.
- The overlay can switch between **player view** and **observer view**.
- Player view is always keyed to the tracked XUID for the tracker currently being presented.
- Default behavior: if the active tracker is the owner's own account, default to player view; otherwise default to observer view.
- Observer view assumes Eagle (team 0) vs Cobra (team 1), with optional per-tracker color overrides for the observer palette.
- When a series is active, the overlay should reuse the existing NeatQueue-style layout: teams and score at the top, game progression at the bottom, ticker options controlled by streamer settings.
- When not in a series, the overlay should support configurable alternate modes, with the initial required set being: hide overlay entirely, or show accumulated-session stats across the top with grouped game or series results along the bottom.
- Ticker behavior must support at least two modes: tracked-player-only stats and all-player stats for the current game or series.
- Grouped-series title and subtitle labels remain runtime-only DO metadata for the active tracker session and are not persisted as part of the streamer settings profile.

### Viewer routing

- Current implementation still uses `/individual-tracker?tracker=<trackerId>` and `/individual-tracker?mode=active`.
- Phase 4 replaces those sharing surfaces with client-routed `/individual-tracker/:xuid/view` and `/individual-tracker/:xuid/overlay` routes.
- Both XUID routes resolve to the user's currently active tracker so OBS and shared audience links remain stable when the owner switches active trackers.
- Manager-to-view and manager-to-overlay transitions should happen without a full page reload.
- The active-tracker switch experience should support a polished transition where the top and bottom overlay sections can slide out, swap data, and slide back in.
- That transition is a first-class requirement for the overlay route; equivalent transition polish for the active view route can land afterward.
- An **Additional Options** toggle "Show stopped trackers" (default: off) controls visibility of stopped trackers in the list.

### Public route behavior

- `/individual-tracker/:xuid/view` is public and unauthenticated.
- If the XUID has a configured streamer surface but no active tracker, the view route should render an offline state rather than a hard not-found error.
- If the XUID has no configured streamer surface at all, the view route should render not found.
- `/individual-tracker/:xuid/overlay` is public and unauthenticated.
- If the XUID has no active tracker, the overlay should collapse to a minimal mostly-empty presentation, retaining only the Guilty Spark branding mark in the corner rather than rendering the full UI chrome.

### Pause auto-stop behaviour

- A paused tracker auto-stops after a configurable idle window (max 6h, matching the idle-timeout setting).
- The UI displays a countdown indicator when a tracker is paused ("auto-stops in Xh Ym").

### Backend API additions needed

- `POST /api/individual-tracker/:trackerId/pause` — pause a specific tracker.
- `POST /api/individual-tracker/:trackerId/resume` — resume a paused tracker.
- `POST /api/individual-tracker/manage/select-active` — mark one tracker as the on-stream live tracker.
- `GET /api/halo/gamertag-search?q=<query>` — gamertag autocomplete proxy (Xbox endpoint if available, exact match fallback).
- Interim implementation note: current Add Tracker search uses `POST /proxy/halo-infinite` with `getUser` + `getUserServiceRecord`; dedicated autocomplete endpoint remains planned.

### Streamer settings section

- Show the stable OBS overlay URL for the user's XUID.
- Show the stable active-view URL for the user's XUID.
- Allow the owner to configure player-view vs observer-view defaults, tracked-player ticker vs all-player ticker behavior, section visibility, and overlay layout behavior.
- Allow observer-color overrides for individual trackers without changing the user's overall global palette.
- Later extension work still lives here:
  - User can link their Twitch account.
  - Toggle to **auto-start tracker when stream goes live** (default: off).
  - Tracker selection for auto-start (default: pinned gamertag tracker).
  - When stream ends: tracker is **paused** (not stopped).
  - Configurable **auto-stop delay** after stream end (how long to wait before fully stopping, 1–6h, default matches idle-timeout setting).
  - Guidance text on how to enable the Twitch extension.
  - Add Extension button linking to Twitch extension page.

### Additional options section

- **Continue tracker when logged out** — per-profile toggle. When enabled, active trackers continue after logout by leveraging the stored refresh token (offline access is enabled in Microsoft OAuth). Default: off.
- **Show stopped trackers** — toggle to reveal stopped trackers in the list. Default: off.
- Logout warning: if active trackers exist and "continue when logged out" is off, the user is warned and given the choice to stop them or let them continue (acknowledging they will stop).

### WebSocket and polling notes

- The alarm should not re-execute while a tracker is paused. The DO broadcasts a paused state over WebSocket so clients update immediately.
- Frontend does not need polling for state override communication; all state updates flow inbound from the WebSocket.
- Paused DO remains resident; resume re-enables the alarm without requiring a full restart.

## Phase 3 UX implementation phases

Core owner workflow delivery is complete. The remaining implementation slices below are the outstanding follow-up backlog:

1. [x] **Shell + tracker list** — new 3-section shell, tracker list with pinned row, status badges, Live badge, empty state info panel, "Add tracker" button.
2. [x] **Add tracker dialog** — gamertag search with service record preview, game history selection, "Start tracker" footer.
3. [x] **Row actions** — ellipsis menu with all actions wired to backend (pause, resume, set live, delete).
4. [x] **Game selection sync dialog** — sync-on-close behaviour.
5. [x] **Client-side routing + active XUID surfaces** — replace hard refreshes with in-app routing and add stable `/individual-tracker/:xuid/view` and `/individual-tracker/:xuid/overlay` routes.
6. [ ] **Streamer settings integration** — rename Streamer Connections, expose OBS/view URLs, and move from the current Additional Options baseline to the broader server-backed settings + per-tracker override UX (global defaults delivered; per-tracker overrides pending).
7. [ ] **Twitch integration follow-up** — add Twitch linking UI, auto-start/stop config, and the remaining operator toggles.

Each backlog item should still land in a separate commit with this document updated alongside it.

### Phase progress log

- [x] Phase 1 committed: introduced the new 3-section shell and live tracker list UI foundation, plus session payload support for linked `xboxGamertag`.
- [x] Phase 2 committed: Add Tracker dialog with gamertag search (proxy-backed), service record preview, recent-match loading (25 + load more), optional selection, and start flow wiring.
- [x] Phase 3 completed: row actions wired end-to-end (pause, resume, set live, delete) against consolidated individual tracker routes.
- [x] Runtime list hydration update: tracker list now resolves from explicit runtime references plus status hydration, with one service call for list + statuses.
- [x] Explicit status model update: removed implicit owner-only status bootstrap in favor of explicit user/tracker routes.
- [x] Frontend service consolidation: individual tracker profile + runtime APIs now use a single consolidated service interface and fake implementation.
- [x] Phase 4 step 4 delivered: active-row "Game selection" action now opens a sync-on-close dialog with category filters and add/remove reconciliation.
- [x] Phase 4 follow-up delivered: replaced the temporary flat recent-match list with a reusable `match-history` component shared by the game-selection dialog and tracker creation flow.
- [x] Viewer UI parity follow-up delivered: extracted shared `series-overview` component from team live tracker and reused it in individual tracker grouped-series rendering.
- [x] Viewer styling follow-up delivered: individual tracker grouped-series view now supports borderless inner parts to better match intended presentation.
- [x] Viewer architecture follow-up delivered: moved grouped timeline/stat derivation into a presenter-side render model and added focused unit coverage for chronological ordering.
- [x] Game selection sync follow-up delivered: replaced per-match add/remove requests with a single bulk tracker sync and persisted manual match groupings for viewer rendering.
- [x] Viewer metadata follow-up delivered: replaced viewer tracker-ID copy with the same reusable rank / peak / game-count summary used by Add Tracker.
- [x] Viewer score follow-up delivered: grouped-series score now derives from Halo team-order data instead of tracked-player win/loss orientation.
- [x] Runtime reliability follow-up delivered: individual tracker DO alarm flow now has focused coverage for initial scheduling, periodic polling, rescheduling, and stale refresh-lock cleanup.
- [x] Viewer + NeatQueue lifecycle follow-up delivered: worker now fans out active NeatQueue series updates on teams-created/substitution events, individual tracker DO stores active pre-series context, viewer renders pre-series roster/substitution info, and match-completed fanout clears active pre-series state.
- [x] Phase 4 routing follow-up delivered: manager now routes in-app to stable XUID-based active view / overlay routes without full-page transitions.
- [x] Phase 4 overlay follow-up delivered: individual tracker overlay now supports player/observer modes, non-series session states, and global server-backed section toggles/defaults.
- [ ] Phase 4 overlay follow-up pending: per-tracker observer-color override UX.

### Current operator note - View tracker behavior

Current behavior for this stage: the "View" row action routes to `/individual-tracker/tracker/:trackerId` and opens a distinct read-only viewer panel for that tracker. Owner follow-active viewing is also available at `/individual-tracker/active`. The viewer boots from explicit status/history fetches, subscribes to live tracker state updates, and renders the shared series/stats presentation with chronological grouped-match handling, team-order-correct grouped-series scoring, shared rank / peak / game-count summary in the header, and active NeatQueue pre-series context (teams, player pre-series info, substitutions) when available.

Planned replacement for Phase 4: stable XUID-based `/individual-tracker/:xuid/view` and `/individual-tracker/:xuid/overlay` routes that follow the active tracker automatically, avoid full reloads via client-side routing, and support richer stream-facing transitions.

## Match history follow-up requirement (April 23, 2026)

The temporary game-selection list delivered in Phase 4 is now superseded by a richer reusable `match-history` component.

### Product requirement

- Reintroduce the richer V1-style match history presentation as a shared `match-history` component.
- Reuse the same component in both the active tracker game-selection dialog and the tracker creation dialog.
- Default to a flat list, but expose prop-driven capabilities so parent surfaces can selectively enable behaviors such as suggested series grouping, manual merge controls, split/break controls, selection state, and top-level action buttons.

### Data and enrichment requirement

- Match enrichment must be frontend-driven rather than built in `api/services/halo`.
- The pages app should fetch recent matches first, then progressively enrich those matches client-side using Halo proxy methods.
- Enrichment should reconstruct the V1 display model, including human-readable map and mode labels, thumbnails/backgrounds, result strings, team rosters, and suggested groupings.
- Suggested grouping behavior should match the V1 heuristic: consecutive non-matchmaking matches are grouped when their starting team rosters match.
- Manual merge/split controls remain available to cover substitute and roster-swap edge cases.

### Performance and loading requirement

- Use browser caching where available, but also introduce an in-memory cache in the pages layer for repeated match, asset, and metadata lookups during a session.
- Progressive loading is acceptable, but the UI should render intentional placeholder states while enrichment is pending.
- Placeholder work should include lightweight text-placeholder components rather than abrupt empty gaps.
- Match background imagery and enriched card content should transition in smoothly rather than appearing instantly.

---

### Frontend settings layout choice

Approach A: Reuse modal-only `SettingsDialog` from team tracker.

- Pros: fastest implementation.
- Cons: poor fit for a persistent control plane, weak discoverability for grouped settings, less reusable for future profile pages.

Approach B: Build a reusable split-pane settings shell (left menu, right controls) and compose individual tracker sections inside it.

- Pros: aligns with requested UX, improves information architecture, reusable for streamer-view and identity-linking pages, clearer desktop workflow while still mobile-first.
- Cons: slightly higher initial implementation cost.

Decision: Approach B selected for long-term maintainability and better operator UX.

### Runtime state sync choice

Approach A: Poll-only for tracker status.

- Pros: simple implementation.
- Cons: stale state between polls and slower operator feedback.

Approach B: REST bootstrap followed by WebSocket subscriptions to active tracker state.

- Pros: immediate updates, consistent with existing live-tracker patterns, better resilience when status changes quickly.
- Cons: requires connection-state handling.

Decision: Approach B selected; individual tracker UI now boots from REST and streams updates via WebSocket.

## Setup notes for David

- Database: ensure new columns/table for individual tracker sessions are applied in D1 before validating start/stop behavior.
- Routes: ensure deployed `wrangler.jsonc` includes `api/individual-tracker/*` and `ws/individual-tracker/*` entries in target environment.
- Session data: verify local `.dev.vars` has Microsoft OAuth values and Halo proxy credentials configured.
- Next manual validation: sign in, create/update profile, start tracker with idle timeout, verify live state updates, verify grouped-series score stays aligned with visible match scores, then stop tracker.

## What I need from David to verify

Please run this quick checklist and share outcomes (pass/fail plus any response payload or console/server log snippet for failures):

1. Start tracker from pinned gamertag and from an alternate searched gamertag.
2. Confirm tracker list updates immediately and shows expected status badges.
3. Confirm stop sets status to stopped and tracker runtime entry is removed from running list.
4. Confirm refresh/reload preserves running trackers via `/api/individual-tracker/manage/:userId/trackers`.
5. Confirm "View" opens the richer read-only viewer mode for `?tracker=` and that `?mode=active` follows the currently active tracker for the signed-in owner.
6. Confirm the viewer header shows the shared rank / peak / game-count summary instead of tracker ID copy.
7. Confirm one grouped series with at least 2-3 visible games has a banner score that matches the visible per-game score ordering.
8. Optional but useful: share one server log block from start flow, one from a stop flow, and one snippet showing periodic individual-tracker polling/alarm activity so we can confirm route/DO pathing in your environment.

## Open decisions (to finalize before implementation)

- [x] Profile model: keep multiple named profiles, with one active or default selected in service logic.
- [x] Separate Durable Object: reintroduce individual live tracking as a dedicated Durable Object, keeping the current live tracker focused on NeatQueue orchestration.
- [x] Ordering model: keep games in time-linear order; do not design around user-driven reorder in the new UI.
- [x] Mutation transport: use authenticated HTTP routes for editor mutations and websocket for read-only live updates.
- [x] Idle timeout: stop only when no new match has been discovered inside the configured timeout window.
- [x] Logout behavior: active trackers stop on logout by default. If the user's profile setting explicitly allows trackers to continue after logout, they are kept alive using the server-side stored refresh token. The logout flow warns the user if active trackers exist and the setting is not enabled, and asks whether to stop them or let them continue.
- [x] Viewer URL behavior: viewer pages are statically rendered with client-side hydration. If no active tracker exists for the requested streamer, the client displays an informational message. No server-side page rendering or routing decision is needed per tracker state.
- [x] Twitch auth flow timing: Phase 5 (Twitch link) as originally planned; Streamer connections UI (Phase 6) can scaffold the UI ahead of full Twitch auth but connection actions require Phase 5 completion.
- [x] Client-side routing choice: use a client-side router for the individual tracker surface; React Router is acceptable for the initial implementation.
- [x] Linked identities: enforce at most one active Xbox identity per user at DB level.
- [x] Tracker list ordering: pinned gamertag tracker (user's own Xbox identity) is always first; remaining trackers are sorted alphabetically by gamertag.
- [x] Pinned tracker: user's own gamertag tracker cannot be deleted. Always shown first. If no linked Xbox identity exists, no pinned row; add-tracker dialog also has no prefilling.
- [x] Live tracker selection: always exactly one live tracker when ≥1 tracker exists. Implicitly live if only one exists (no "Set as live" shown). Live badge appears on the live row.
- [x] Stop semantics: hard-deletes the DO. Tracker entity + configuration survive in D1 for restart. Stopped trackers hidden by default (Additional Options toggle to reveal).
- [x] Pause semantics: DO remains resident, alarm is suspended. Auto-stop after configurable idle window (max 6h). WebSocket broadcasts paused state. No DO restart needed on resume.
- [x] Game selection sync: 1:1 sync on dialog close. Newly checked → added to state; newly unchecked → removed from state. Applied as a single atomic mutation.
- [x] Streamer settings scope: global settings live in profile dropdown (not page-specific). Per-tracker dialog allows overrides, inheriting from global.
- [x] Grouped-series label scope: title and subtitle are runtime-only metadata attached to one grouped-series object within the active individual tracker DO. They are not tracker-global and are not persisted to D1 in this phase.
- [x] Grouped-series default labels: manual / heuristic groups default to `Eagle vs Cobra` and `Best of X`, where `X` is the grouped series `matchIds.length`; users can override both inline.
- [x] Label identity: custom labels stay attached to the grouped-series object rather than acting as tracker-level settings.
- [x] NeatQueue linkage: use XUID overlap to associate NeatQueue series metadata with active individual trackers; if a new NeatQueue series starts for the same player, it supersedes the previous series for future updates.
- [x] NeatQueue coordination transport: use worker-mediated fanout from NeatQueue lifecycle updates into matching individual tracker DOs rather than DO-to-DO subscriptions or WebSocket coupling.
- [x] Twitch stream-end behavior: pause tracker (not stop). Configurable auto-stop delay (1–6h) after stream end, so intermittent stream drops don't lose state.
- [x] Active streamer routing target: use stable XUID-based `/individual-tracker/:xuid/view` and `/individual-tracker/:xuid/overlay` routes that always resolve to the user's currently active tracker.
- [x] Route auth model: XUID-based view and overlay routes are public and unauthenticated.
- [x] Offline/not-found behavior: XUID view route shows offline when configured but inactive, and not found when no configured XUID surface exists; overlay route collapses to a minimal branded empty state when inactive.
- [x] Streamer settings scope: persist global per-user overlay settings server-side, with per-tracker overrides limited to observer-view colors.
- [x] Overlay-first transition priority: polished active-tracker transition is required for overlay first; equivalent view-route transition work can follow.
- [x] Gamertag search: use Xbox search endpoint if available (autocomplete with lightweight service record preview). Exact match fallback if not.

## Kickoff checklist

- [x] Confirm API contract and route naming for individual live tracker endpoints.
- [x] Confirm Durable Object ID scheme: `userId:trackerId`, maximum 5 concurrent per user.
- [x] Confirm first DB schema (defined, reviewed, and ready to execute manually).
- [x] Confirm session cookie and CSRF strategy (HMAC-SHA256 signed payload, HttpOnly, Secure, SameSite=Strict).
- [x] Confirm frontend and Durable Object state ownership boundaries.
- [x] Confirm shared DO logic lives in a base class within the `api` package.
- [x] Start implementation with Phase 1.
