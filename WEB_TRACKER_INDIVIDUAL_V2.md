# Web Individual Tracker v2 Proposal

**Status**: Active proposal — Phase 1 in progress
**Date**: April 7, 2026

## Goal

Build a frontend-driven individual tracker where users sign in with Microsoft, control their own streamer view, and persist custom tracked games. The same authenticated user model should be reusable for a future Twitch extension.

## Product Direction

### Core user flow

1. User opens the tracker page.
2. User signs in with Microsoft OAuth (PKCE).
3. User selects or searches their gamertag/profile.
4. User adds/removes games in their individual tracker view.
5. User customizes streamer presentation (display mode, ordering, visibility controls).
6. User returns later and sees persisted state (same identity/session).

### Long-term user flow (Twitch extension)

1. Signed-in user links Twitch account.
2. Extension reads the same tracker state and streamer view preferences.
3. Streamer controls updates in one place; Twitch extension reflects updates.

## Architecture (v2)

### Frontend responsibilities

- Own tracker composition state (selected games, removed games, display preferences).
- Render timeline and stats from proxied Halo API responses.
- Optimistic UI for add/remove actions with server reconciliation.

### API responsibilities

- Handle Microsoft OAuth callback and app session cookies.
- Authorize browser requests using session cookies.
- Proxy allowed Halo API calls via `/proxy/halo-infinite`.
- Persist per-user tracker state and streamer settings.
- Expose endpoints for CRUD operations on user tracker configuration.

### Data model (new)

- `user_sessions` (session id, user id, expiry, auth metadata)
- `linked_identities` (user id, xbox xuid/gamertag, optional twitch id)
- `individual_tracker_profiles` (profile id, user id, active identity, name)
- `individual_tracker_games` (profile id, match id, position, included/excluded, annotations)
- `streamer_view_settings` (profile id, layout options, visible sections, style flags)

Use D1 for persistent relational data. Keep tokens and session secrets server-only.

## Auth and security model

### Microsoft sign-in

- Use OAuth2 Authorization Code with PKCE.
- Exchange code on backend only.
- Store app session in secure, HttpOnly, SameSite cookie.

### Proxy hardening

- Keep worker-to-worker token path for internal calls.
- Add browser-session authorization path for web UI.
- Enforce allowlist of proxied Halo methods/routes.
- Validate payload shapes and size limits.
- Add rate limits per user/session.
- Add audit logs for proxied calls and tracker mutations.

### Ownership rules

- Users can mutate only their own tracker profiles.
- Read-only share links are optional and separate from editor permissions.
- Twitch extension reads only profiles explicitly linked by the owner.

## API contract

### Auth

- [x] `GET /auth/microsoft/start`
- [x] `GET /auth/microsoft/callback`
- [ ] `POST /auth/logout`
- [ ] `GET /auth/session`

### Individual tracker profile

- [ ] `GET /api/individual-tracker/profile`
- [ ] `POST /api/individual-tracker/profile`
- [ ] `PATCH /api/individual-tracker/profile`

### Game selection controls

- [ ] `POST /api/individual-tracker/games:add`
- [ ] `POST /api/individual-tracker/games:remove`
- [ ] `POST /api/individual-tracker/games:reorder`

### Streamer view controls

- [ ] `GET /api/individual-tracker/streamer-view`
- [ ] `PATCH /api/individual-tracker/streamer-view`

### Halo proxy

- [ ] `POST /proxy/halo-infinite` — session-authenticated for browser, token-authenticated for internal callers

## UI plan

### Phase A: signed-in tracker shell

- [ ] Login gate and session bootstrap.
- [ ] Basic profile selector and gamertag binding.
- [ ] Tracker page loads from saved profile.

### Phase B: editable game list

- [ ] Add game by match id/search result.
- [ ] Remove game from tracked timeline.
- [ ] Reorder games and pin featured matches.

### Phase C: streamer controls

- [ ] Toggle sections (scoreboard, medals, timeline, player cards).
- [ ] Save layout preferences.
- [ ] Add a clean "streamer mode" URL/state.

### Phase D: Twitch extension readiness

- [ ] Add Twitch link flow and ownership verification.
- [ ] Provide extension-safe read endpoint and short-lived viewer tokens.
- [ ] Reuse existing streamer view profile without duplicating settings.

## Delivery phases

### Phase 1 - Foundation

- [x] Microsoft Entra app registration and environment variables configured.
- [x] Microsoft OAuth + PKCE auth service (`MicrosoftAuthService`, `SessionManager`, `AuthService`).
- [x] Session signing with HMAC-SHA256 and secure HttpOnly cookie.
- [x] `GET /auth/microsoft/start` endpoint (returns auth URL).
- [x] `GET /auth/microsoft/callback` endpoint (exchanges code, sets session cookie).
- [ ] `POST /auth/logout` endpoint (clears session cookie).
- [ ] `GET /auth/session` endpoint (returns current session user).
- [ ] Session-aware `/proxy/halo-infinite` (accept session cookie in addition to worker token).
- [ ] Initial D1 schema migration (`user_sessions`, `linked_identities`).

### Phase 2 - Tracker profile CRUD

- [ ] `individual_tracker_profiles` D1 migration.
- [ ] `individual_tracker_games` D1 migration.
- [ ] Create/read/update profile endpoints.
- [ ] Persist selected/removed games.
- [ ] FE integration with optimistic updates.

### Phase 3 - Streamer controls

- [ ] `streamer_view_settings` D1 migration.
- [ ] Streamer-view settings API + UI.
- [ ] URL/share behavior for live stream usage.

### Phase 4 - Twitch extension integration

- [ ] Twitch account linking.
- [ ] Extension read endpoints and access controls.
- [ ] Operational monitoring and abuse protection.

## Non-goals for initial kickoff

- Rebuilding Durable Object individual tracker flows.
- DO-to-DO subscriptions for individual mode.
- Reintroducing `/ws/tracker/individual/:gamertag`.

## Cleanup status

Legacy individual-web-tracker cleanup is complete.

- [x] Removed pages individual-mode rendering path built around `type: "individual"` live state.
- [x] Removed tracker-initiation flow that depended on removed endpoints (`/api/tracker/individual/*`).
- [x] Simplified shared live tracker contracts by removing individual union variants not used by team tracker.
- [x] Removed fake scenarios/data dedicated to old individual WebSocket mode.

## Open decisions (to finalize before implementation)

- [ ] Single profile per user vs multiple named profiles.
- [ ] Whether add/remove game actions are immediate writes or queued patches.
- [ ] Share-link permissions model (public read vs private-only until Twitch linkage).
- [ ] Twitch auth flow timing (Phase 3.5 vs Phase 4).

## Kickoff checklist

- [ ] Confirm API contract naming for individual tracker endpoints.
- [ ] Confirm first DB schema migration.
- [x] Confirm session cookie and CSRF strategy (HMAC-SHA256 signed payload, HttpOnly, Secure, SameSite=Strict).
- [ ] Confirm frontend state ownership boundaries.
- [x] Start implementation with Phase 1.
