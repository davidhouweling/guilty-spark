# Guilty Spark — Individual Tracker Roadmap

## URL structure (agreed, immutable)

| Route                             | Access                    | Description                                        |
| --------------------------------- | ------------------------- | -------------------------------------------------- |
| `/individual-tracker`             | Auth-required, owner-only | Manager: tracker list + row actions + settings     |
| `/individual-tracker/<trackerId>` | Auth-required, owner-only | Per-tracker viewer (no OBS overlay)                |
| `/u/<gamertag>/view`              | **Public**                | Follow-live viewer — resolves owner's live tracker |
| `/u/<gamertag>/overlay`           | **Public**                | Follow-live OBS overlay — same resolver            |

**`/u/<gamertag>` is the ONLY public surface.** XUID-based public routes (`/individual-tracker/[xuid]/...`) were considered and rejected — they were never merged.

---

## Milestone status

### Merged to main ✓

| Slice                  | PR(s)                                                                                                                                                                                                                                                            | Description                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Login / auth           | [#453](https://github.com/davidhouweling/guilty-spark/pull/453)                                                                                                                                                                                                  | Microsoft OAuth, Xbox avatar, `ProfileMenu`, logout                             |
| A1–A3                  | [#454](https://github.com/davidhouweling/guilty-spark/pull/454)–[#456](https://github.com/davidhouweling/guilty-spark/pull/456)                                                                                                                                  | Identity linking, tracker profiles, CORS                                        |
| B1–B5                  | [#458](https://github.com/davidhouweling/guilty-spark/pull/458)–[#462](https://github.com/davidhouweling/guilty-spark/pull/462)                                                                                                                                  | DO skeleton, proxy, credentials, polling, control routes                        |
| B3a/b                  | [#463](https://github.com/davidhouweling/guilty-spark/pull/463)–[#466](https://github.com/davidhouweling/guilty-spark/pull/466)                                                                                                                                  | Halo proxy refactor + UserTokenProvider                                         |
| C2 (viewer read path)  | [#469](https://github.com/davidhouweling/guilty-spark/pull/469), [#470](https://github.com/davidhouweling/guilty-spark/pull/470)                                                                                                                                 | Public viewer REST + WebSocket                                                  |
| E1–E3                  | [#464](https://github.com/davidhouweling/guilty-spark/pull/464), [#467](https://github.com/davidhouweling/guilty-spark/pull/467)                                                                                                                                 | Manager UI + add-tracker dialog                                                 |
| F1 (viewer + overlay)  | [#472](https://github.com/davidhouweling/guilty-spark/pull/472)–[#475](https://github.com/davidhouweling/guilty-spark/pull/475), [#478](https://github.com/davidhouweling/guilty-spark/pull/478)–[#481](https://github.com/davidhouweling/guilty-spark/pull/481) | Server tab info, viewer service/page, stats panel                               |
| A3 / E5 (settings)     | [#485](https://github.com/davidhouweling/guilty-spark/pull/485)–[#489](https://github.com/davidhouweling/guilty-spark/pull/489)                                                                                                                                  | Streamer-view settings API + UI + colour wiring                                 |
| F2–F4 (follow-live)    | [#490](https://github.com/davidhouweling/guilty-spark/pull/490)–[#493](https://github.com/davidhouweling/guilty-spark/pull/493)                                                                                                                                  | `/u/<gamertag>/view` + overlay pages                                            |
| G1 / G2                | [#495](https://github.com/davidhouweling/guilty-spark/pull/495)                                                                                                                                                                                                  | Generalise `StreamerOverlay`; migrate live-tracker + individual-tracker overlay |
| G3 (top-bar stats API) | [#496](https://github.com/davidhouweling/guilty-spark/pull/496)                                                                                                                                                                                                  | Server-side top-bar stat accumulation + caching                                 |
| G4 (top-bar rank/ESRA) | [#498](https://github.com/davidhouweling/guilty-spark/pull/498)                                                                                                                                                                                                  | Rank + ESRA top-bar stat slots via `haloService`                                |
| G5 (top-bar client)    | [#499](https://github.com/davidhouweling/guilty-spark/pull/499)                                                                                                                                                                                                  | Wire `topBarStats` to overlay + slot picker in settings form                    |
| Review hardening       | [#477](https://github.com/davidhouweling/guilty-spark/pull/477)                                                                                                                                                                                                  | Holistic code-review pass over entire IT surface                                |

### Open PRs

None — all individual-tracker milestones through G5 are merged.

---

## Next up

1. **E4** — game include/exclude dialog (manager UI; needs DO-discovered matches, now available)
2. **Series grouping upgrades** — NeatQueue fan-out title/subtitle + manual series; port `analyzeMatchGroupings` from rework
3. **Post-completion tech debt** (low priority, defer until feature work is done):
   - Adopt `WebSocketHibernationAdapter` in the live-tracker DO
   - Fix flaky round-robin maps test (seed randomness)
   - Upgrade `StatsPanel` `playerMap` to real gamertags + medal metadata
   - Adopt `createHaloInfiniteClientProxy` in the live-tracker pages service

---

## Excluded from scope (never finishing)

- Manual series start/end (non-NeatQueue)
- Discord / Twitch presence-triggered auto-start
- Proxy rate-limit / audit log
