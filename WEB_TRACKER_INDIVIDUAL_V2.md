# Web Individual Tracker v2 Proposal

**Status**: Active proposal — Phase 3 UX rework approved, implementation starting
**Date**: April 7, 2026 (UX decisions recorded: April 12, 2026)

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

- [x] `POST /api/individual-live-tracker/start` — create a new active tracker for the signed-in user; resolves XUID from the linked identity; returns a `trackerId`
- [x] `POST /api/individual-live-tracker/:trackerId/stop` — stop a specific active tracker owned by the signed-in user
- [ ] `POST /api/individual-live-tracker/:trackerId/pause` — pause a specific active tracker (alarm suspended, DO remains resident)
- [ ] `POST /api/individual-live-tracker/:trackerId/resume` — resume a paused tracker (re-enable alarm)
- [x] `GET /api/individual-live-tracker/status` — list all active tracker instances for the signed-in user
- [ ] `POST /api/individual-live-tracker/select-active` — mark one tracker as the current on-stream presenter
- [x] `POST /api/individual-live-tracker/:trackerId/games:add` — add a past match into the active tracker
- [x] `POST /api/individual-live-tracker/:trackerId/games:remove` — remove a match from the active tracker
- [ ] `GET /api/halo/gamertag-search?q=<query>` — gamertag autocomplete (Xbox endpoint if available, exact match fallback)

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

### Halo proxy

- [x] `POST /proxy/halo-infinite` — session-authenticated for browser, token-authenticated for internal callers

### Viewer routes

> Viewer routes are public and require no authentication. The UI is statically rendered with client-side hydration. If no active tracker exists, the client displays an informational message.

- [x] `GET /ws/individual-tracker/:userId/:trackerId` — WebSocket for a specific active tracker
- [x] `GET /ws/individual-tracker/:userId/active` — WebSocket that resolves to the current on-stream tracker
- [x] `GET /api/individual-live-tracker/:userId/active` — REST status of the current on-stream tracker (for initial render before WebSocket upgrade)

## UI plan

### Phase A: signed-in tracker shell

- [x] Dedicated login page and session bootstrap.
- [ ] Basic profile selector and gamertag binding.
- [x] Tracker page loads from saved profile.
- [x] Start tracker flow defaults to the linked gamertag but allows searching another gamertag.
- [x] Idle-timeout setting is visible in profile settings.
- [ ] Logout warning is shown when active trackers exist and the profile is not configured to allow them to continue.

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
- [x] Reintroduce a separate individual live tracker Durable Object.
- [x] Add authenticated start/stop/status routes for individual live trackers.
- [x] Ensure individual live trackers use the signed-in user's Halo credentials rather than the default shared live-tracker credentials.
- [x] Confirm active tracker routing model: per-tracker route plus stable follow-the-stream route.
- [x] Re-implement individual tracker page UI around active live tracker control and time-linear game augmentation.
- [x] Add idle-timeout settings with allowed values of 1h, 2h, 3h, 4h, 5h, and 6h, defaulting to 1h.
- [ ] Add logout behavior setting for whether active trackers may continue after logout.
- [x] Stop trackers automatically only when no new matches are discovered within the configured window.
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
2. **Streamer Connections** — "Connect your accounts and automate your stream." — Twitch link, auto-start/stop, tracker selection.
3. **Additional Options** — "Fine-tune how your trackers behave." — Offline continuation, show stopped trackers toggle, etc.

### Tracker list layout and ordering

- The user's own linked Xbox gamertag is always the **first row** and cannot be deleted. It is pinned as the default ownership tracker.
- Remaining trackers are sorted alphabetically by gamertag after the pinned row.
- If no linked Xbox identity exists (rare edge case), the pinned row is omitted; the "Add tracker" button has no prefilling.
- When the list is empty (no pinned row and no trackers), an information panel below the empty list explains how individual tracking works.

### Tracker states

Three valid states stored per tracker in D1:

| State | DO alive | Notes |
|-------|----------|-------|
| `active` | Yes | Alarm fires normally. DO polls Halo Infinite. |
| `paused` | Yes | Alarm does **not** re-execute while paused. DO stays resident. A WebSocket message is broadcast to clients on pause. UI shows auto-stop countdown (max 6h). |
| `stopped` | No | DO is hard-deleted. Tracker entity and configuration remain in D1 so the user can restart with default empty runtime. |

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

| Action | Availability | Behaviour |
|--------|-------------|-----------|
| Set as live | Only when >1 tracker exists and this tracker is not live | Marks this tracker as the on-stream presenter |
| View | Always | Routes to `/individual-tracker?tracker=<trackerId>` in viewer mode |
| Pause | Active only | Pauses alarm execution; broadcasts paused state via WebSocket. Paused auto-stops after 6h (configurable). |
| Resume | Paused only | Re-enables alarm; broadcasts active state |
| Stop | Active or paused | Hard-stops DO, clears runtime state. Configuration survives in D1. |
| Delete | Always | Removes tracker from D1 entirely. Confirmation required. Pinned gamertag tracker cannot be deleted. |
| Game selection | Active only | Opens game-selection dialog (see below) |
| Streamer settings | Always | Opens streamer settings dialog scoped to this tracker (inherits global, allows overrides) |

### Game selection dialog (active trackers only)

- Shows the game type filters: **Matchmaking**, **Custom**, **Local**.
- Shows the account's match history (recent 25, "Load more" for next 25).
- Games already in the tracker state are **pre-checked**; games not in state are unchecked.
- On dialog close, the selection is **synced** as a 1:1 mapping: newly checked games are added to state, unchecked games that were previously checked are removed. This is applied as a single atomic mutation.

### Streamer settings

- A **global** streamer settings profile is accessible from the profile dropdown menu in the header (not page-specific).
- Each tracker inherits the global settings by default.
- The per-tracker streamer settings dialog allows specific overrides, stored against that tracker's profile entry.
- The default overlay text/labels currently tied to NeatQueue context must be reviewed to be neutral or gamertag-centric for individual tracking.

### Viewer routing

- "View" action routes to `/individual-tracker?tracker=<trackerId>` with a query parameter identifying the tracker, rather than a unique per-tracker route.
- An **Additional Options** toggle "Show stopped trackers" (default: off) controls visibility of stopped trackers in the list.

### Pause auto-stop behaviour

- A paused tracker auto-stops after a configurable idle window (max 6h, matching the idle-timeout setting).
- The UI displays a countdown indicator when a tracker is paused ("auto-stops in Xh Ym").

### Backend API additions needed

- `POST /api/individual-live-tracker/:trackerId/pause` — pause a specific tracker.
- `POST /api/individual-live-tracker/:trackerId/resume` — resume a paused tracker.
- `POST /api/individual-live-tracker/select-active` — mark one tracker as the on-stream live tracker (already listed, not yet implemented).
- `GET /api/halo/gamertag-search?q=<query>` — gamertag autocomplete proxy (Xbox endpoint if available, exact match fallback).
- Interim implementation note: current Add Tracker search uses `POST /proxy/halo-infinite` with `getUser` + `getUserServiceRecord`; dedicated autocomplete endpoint remains planned.

### Streamer connections section

- User can link their Twitch account.
- When linked:
  - Toggle to **auto-start tracker when stream goes live** (default: off).
  - Tracker selection for auto-start (default: pinned gamertag tracker).
  - When stream ends: tracker is **paused** (not stopped).
  - Configurable **auto-stop delay** after stream end (how long to wait before fully stopping, 1–6h, default matches idle-timeout setting). Rationale: if the stream drops mid-session, this window lets it recover without losing state.
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

Implementation will proceed in individual committed phases:

1. [x] **Shell + tracker list** — new 3-section shell, tracker list with pinned row, status badges, Live badge, empty state info panel, "Add tracker" button.
2. [ ] **Add tracker dialog** — gamertag search with service record preview, game history selection, "Start tracker" footer.
3. [ ] **Row actions** — ellipsis menu with all actions wired to backend (add pause/resume endpoints as needed).
4. [ ] **Game selection sync dialog** — sync-on-close behaviour.
5. [ ] **Streamer settings integration** — global settings in profile dropdown, per-tracker override dialog.
6. [ ] **Streamer connections + additional options** — Twitch linking UI, auto-start/stop config, additional toggles.

Each phase is committed separately with the proposal document updated to reflect progress.

### Phase progress log

- [x] Phase 1 committed: introduced the new 3-section shell and live tracker list UI foundation, plus session payload support for linked `xboxGamertag`.
- [x] Phase 2 committed: Add Tracker dialog with gamertag search (proxy-backed), service record preview, recent-match loading (25 + load more), optional selection, and start flow wiring.

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
- Routes: ensure deployed `wrangler.jsonc` includes `api/individual-live-tracker/*` and `ws/individual-tracker/*` entries in target environment.
- Session data: verify local `.dev.vars` has Microsoft OAuth values and Halo proxy credentials configured.
- Next manual validation: sign in, create/update profile, start tracker with idle timeout, verify live state updates, then stop tracker.

## Open decisions (to finalize before implementation)

- [x] Profile model: keep multiple named profiles, with one active or default selected in service logic.
- [x] Separate Durable Object: reintroduce individual live tracking as a dedicated Durable Object, keeping the current live tracker focused on NeatQueue orchestration.
- [x] Ordering model: keep games in time-linear order; do not design around user-driven reorder in the new UI.
- [x] Mutation transport: use authenticated HTTP routes for editor mutations and websocket for read-only live updates.
- [x] Idle timeout: stop only when no new match has been discovered inside the configured timeout window.
- [x] Logout behavior: active trackers stop on logout by default. If the user's profile setting explicitly allows trackers to continue after logout, they are kept alive using the server-side stored refresh token. The logout flow warns the user if active trackers exist and the setting is not enabled, and asks whether to stop them or let them continue.
- [x] Viewer URL behavior: viewer pages are statically rendered with client-side hydration. If no active tracker exists for the requested streamer, the client displays an informational message. No server-side page rendering or routing decision is needed per tracker state.
- [x] Twitch auth flow timing: Phase 5 (Twitch link) as originally planned; Streamer connections UI (Phase 6) can scaffold the UI ahead of full Twitch auth but connection actions require Phase 5 completion.
- [x] Linked identities: enforce at most one active Xbox identity per user at DB level.
- [x] Tracker list ordering: pinned gamertag tracker (user's own Xbox identity) is always first; remaining trackers are sorted alphabetically by gamertag.
- [x] Pinned tracker: user's own gamertag tracker cannot be deleted. Always shown first. If no linked Xbox identity exists, no pinned row; add-tracker dialog also has no prefilling.
- [x] Live tracker selection: always exactly one live tracker when ≥1 tracker exists. Implicitly live if only one exists (no "Set as live" shown). Live badge appears on the live row.
- [x] Stop semantics: hard-deletes the DO. Tracker entity + configuration survive in D1 for restart. Stopped trackers hidden by default (Additional Options toggle to reveal).
- [x] Pause semantics: DO remains resident, alarm is suspended. Auto-stop after configurable idle window (max 6h). WebSocket broadcasts paused state. No DO restart needed on resume.
- [x] Game selection sync: 1:1 sync on dialog close. Newly checked → added to state; newly unchecked → removed from state. Applied as a single atomic mutation.
- [x] Streamer settings scope: global settings live in profile dropdown (not page-specific). Per-tracker dialog allows overrides, inheriting from global.
- [x] Twitch stream-end behavior: pause tracker (not stop). Configurable auto-stop delay (1–6h) after stream end, so intermittent stream drops don't lose state.
- [x] Tracker viewer routing: `/individual-tracker?tracker=<trackerId>` with query param, not unique per-tracker route.
- [x] Gamertag search: use Xbox search endpoint if available (autocomplete with lightweight service record preview). Exact match fallback if not.

## Kickoff checklist

- [x] Confirm API contract and route naming for individual live tracker endpoints.
- [x] Confirm Durable Object ID scheme: `userId:trackerId`, maximum 5 concurrent per user.
- [x] Confirm first DB schema (defined, reviewed, and ready to execute manually).
- [x] Confirm session cookie and CSRF strategy (HMAC-SHA256 signed payload, HttpOnly, Secure, SameSite=Strict).
- [x] Confirm frontend and Durable Object state ownership boundaries.
- [x] Confirm shared DO logic lives in a base class within the `api` package.
- [x] Start implementation with Phase 1.
