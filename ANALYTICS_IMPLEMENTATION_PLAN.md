# Analytics Implementation Plan: Kill Matrix + Score Progression

**Status**: Stage 1 Complete (Contract + Route merged); Stage 2a Complete (Backend Film Integration); Stage 2b Pending (Frontend Tabs)  
**Last Updated**: 2026-06-11  
**Constraint**: Each PR ≤ 500 lines (AGENTS.md compliance)  
**Prototype Reference**: Prototype film extraction logic available in attached `extractor.ts` and `types.ts`

---

## Overview

**Stage 1 (✓ Complete)**: Contract + API Route foundation ([PR 537](https://github.com/davidhouweling/guilty-spark/pull/537))

- Zod schema for `MatchAnalytics` with `killMatrix` module
- Route: `GET /api/stats/match-analytics/:matchId?modules=killMatrix`
- Contract-driven roundtrip with Zod validation

**Stage 2 (In Progress)**: Film Data Integration

- Add film fetch/auth to AnalyticsService (via new HaloFilmService or direct integration)
- Adapt prototype extractor logic from attached `extractor.ts` (auth context, film metadata fetch, chunk download, event parsing)
- Reshape prototype output to match Stage 1 contract
- Add caching and tests

Unified analytics delivery across three stats consumption paths:

1. **Match Stats** (`pages/src/components/stats/match-stats.tsx`) — Per-match view in Discord Series Stats page
2. **Series Stats** (`pages/src/components/stats/series-stats.tsx`) — Accumulated series view in Discord Series Stats page
3. **Individual Tracker Viewer** (`pages/src/components/individual-tracker/viewer/`) — Live match stats in Individual Tracker app

**Goal**: Kill Matrix MVP sourced from real film data, with extensible design for Score Progression Phase 2, no duplication across three paths.

---

## Stage 2: Film Integration Architecture

### Film Service Design

**Prototype Foundation**: Attached `extractor.ts` contains proven film fetch/auth/parse logic. This becomes:

**Option A (Recommended)**: New `HaloFilmService` in `api/services/halo/`

- Encapsulates film metadata fetch, chunk download, event parsing
- Depends on: `HaloInfiniteClient` (for match stats), `XboxService` (for token fallback), `CustomSpartanTokenProvider`
- Returns: Structured event stream + kill matrix aggregates
- AnalyticsService depends on HaloFilmService

**Option B**: Extend AnalyticsService with film logic directly

- Simpler for now, but less reusable if other services need film data later
- Feasible for MVP if service stays <500 LOC

**Prototype Mapping**:

- `resolveAuthContext()` → Reuse existing XboxService + CustomSpartanTokenProvider pattern
- `fetchJson/fetchBinary()` → Use native fetch with custom headers
- `parseHighlightEvents()` → Port directly to service (bit-level parsing logic is stable)
- `buildKillMatrixAnalytics()` → Port directly to service (aggregation logic)
- Auth headers: `x-343-authorization-spartan` + `343-clearance` (see `extractor.ts` createHeaders)
- Film endpoint: `/hi/films/matches/{matchId}/spectate` on `https://discovery-infiniteugc.svc.halowaypoint.com:443`

**Caching Strategy** (Cloudflare Worker KV via `env.APP_DATA`):

- Cache key: `film:metadata:{matchId}`
- Cache key: `film:chunk:{matchId}:{chunkIndex}`
- TTL: `31536000` (1 year, since film data is immutable)
- Retrieve via `env.APP_DATA.get()` before calling Halo API
- Store parsed results via `env.APP_DATA.put()` after first fetch

## Architecture Decisions

### 1) Kill Matrix Data Shape

**Chosen**: `Map<killerXuid, { killed: victimXuid, perfect: boolean, weapon?: string, headshot?: boolean }>`

**Rationale**:

- XUID keys enable O(1) gamertag lookup from existing match stats player lists
- Xuid key === victimXuid → suicide
- Compare teamIds from match stats → betrayal vs. enemy-kill classification at display time
- Weapon/headshot optional extension doesn't require schema change

**Example**:

```typescript
{
  "2533274844642438": {
    "killed": "2533274881185517",
    "perfect": false,
    "weapon": "Ravager",
    "headshot": false
  },
  "2533274844642438": {
    "killed": "2535461840898551",
    "perfect": true,
    "weapon": "Precision Rifle",
    "headshot": true
  }
}
```

### 2) Unified Analytics Contract

Single contract `MatchAnalytics` with optional modules:

```typescript
export const matchAnalyticsSchema = z.object({
  requestedModules: z.array(z.enum(["killMatrix", "scoreProgression"])),
  killMatrix: z.optional(
    z.record(
      z.string(),
      z.object({
        killed: z.string(),
        perfect: z.boolean(),
        weapon: z.optional(z.string()),
        headshot: z.optional(z.boolean()),
      }),
    ),
  ),
  scoreProgression: z.optional(/* Phase 2 */),
  metadata: z.object({
    pairingQuality: z.object({
      unpairedDeathCount: number,
      maxTimeDeltaMs: number,
    }),
    perfectCounts: z.object({
      total: number,
      byXuid: z.record(z.string(), z.number()),
    }),
  }),
});

export const matchAnalyticsContract = defineContract(z.object({ analytics: matchAnalyticsSchema }));
```

### 3) Data Sourcing

**Stage 2**: Real film data via HaloFilmService (or AnalyticsService direct)

- Fetch film metadata from Halo Waypoint API (`/hi/films/matches/{matchId}/spectate`)
- Download highlight chunk (ChunkType = 3, contains kill/death/medal/mode events)
- Parse binary chunk: decompress (zlib) → scan for event markers → extract XUID, timestamps, type hints
- Join events to team IDs from match stats
- Aggregate kills + deaths into kill matrix by killer/victim pair
- Compute perfect counts from medal events
- Return shaped data matching `MatchAnalytics` contract

**Prototype Logic Reuse**:

- Bit-level parsing (`getBit`, `setBit`, `readLittleEndianUnsigned`, `findPatternBitOffset`) — proven in `extractor.ts`
- Event classification (`inferEventType`, `parseHighlightEvent`) — proven in `extractor.ts`
- Kill pairing logic (`classifyKillPair`, `buildKillMatrixAnalytics`) — proven in `extractor.ts`
- No new parsing research needed; adapt existing logic to service layer

**For Phase 2**: Add score progression computation (same approach: extract mode events from film, aggregate by time window)

### 4) API Route (Stage 1 Complete)

**Existing Route**: `GET /api/stats/match-analytics/:matchId?modules=killMatrix`

**Handler Implementation** (Stage 2):

- Call `analyticsService.getMatchAnalytics(matchId, modules)`
- AnalyticsService internally:
  1. Calls HaloFilmService (or film fetch logic) to get raw events
  2. Filters to requested modules
  3. Aggregates into kill matrix shape
  4. Returns `MatchAnalytics` response
- Route wraps response with cache headers: `Cache-Control: public, max-age=31536000` (immutable film data)

**Caching** (Cloudflare Worker KV via HaloFilmService or AnalyticsService):

- Film metadata + parsed events cached in `env.APP_DATA` with 1-year TTL
- Analytics computation happens on every request (fast, ~50ms cache hit)
- Halo Waypoint API hit only on first request per unique film

### 5) Unified Tab Shell Component

**New**: `pages/src/components/shared/tabbed-section/`

- Extract from existing Individual Tracker Manager tab behavior
- Generic `TabbedSection` component: takes `tabs: { label, content }[]`, manages selected index
- CSS module matches existing styles in Individual Tracker Manager

**Usage across all three stats paths**:

```tsx
<TabbedSection
  tabs={[
    { label: "Players", content: <PlayersSection /> },
    { label: "Accumulated Stats", content: <AccumulatedStatsSection /> },
    { label: "Kill Matrix", content: <KillMatrixTab /> },
  ]}
  defaultTab={0}
/>
```

### 6) Kill Matrix Presenter (Reusable)

**New**: `pages/src/components/stats/kill-matrix-presenter.ts`

```typescript
export class KillMatrixPresenter {
  /**
   * Transform raw analytics into table-ready rows.
   * Returns: { killer, victim, count, perfect, classification }[]
   */
  static present(
    analytics: MatchAnalytics,
    playersByXuid: Map<string, { gamertag: string; teamId: number }>,
  ): KillMatrixViewModel[] {
    // Expand map entries
    // Classify each pair
    // Compute row styling (perfect, betrayal, suicide)
  }
}
```

**Same presenter used in**:

- Match Stats (per-match kill matrix)
- Series Stats (aggregate across matches)
- Individual Tracker Viewer (live match kill matrix)

### 7) UI Integration Points

#### **Match Stats** (`pages/src/components/stats/match-stats.tsx`)

- Wrap existing Players + (future) Accumulated sections into TabbedSection
- Add Kill Matrix tab (lazy-loaded)
- Default tab = "Players"

#### **Series Stats** (`pages/src/components/stats/series-stats.tsx`)

- Wrap existing Accumulated Player Stats section into TabbedSection
- Add Kill Matrix tab (aggregates across all matches in series)
- Default tab = "Accumulated Player Stats"

#### **Individual Tracker Viewer** (`pages/src/components/individual-tracker/viewer/`)

- Add TabbedSection to match card stats rendering
- Kill Matrix tab for each match
- Default tab = existing stats view

---

## PR Breakdown: Stage 2

### **PR 2a: Film Service + Analytics Service Implementation** (Stage 2, Slice 1)

- **Goal**: Deliver real kill matrix data to existing route, sourced from film data
- **Prototype Reference**: Adapt `extractor.ts` auth context, parsing, kill matrix logic; `types.ts` data structures
- **Size**: ~350 lines

**Files to Create**:

- `api/services/halo/halo-film.ts` — (Option A) New service for film fetch/parse, OR integrated into AnalyticsService
  - Auth context resolution (env tokens → fallback to repo auth via XboxService + CustomSpartanTokenProvider)
  - Film metadata fetch from `/hi/films/matches/{matchId}/spectate`
  - Chunk download and binary decompression
  - Event parsing (bit-level logic from prototype)
  - Caching via `env.APP_DATA`
- `api/services/analytics/analytics.ts` (if choosing Option B) OR trim down if using Option A

**Files to Modify**:

- `api/services/install.ts` — Register new service (HaloFilmService if Option A)
- `api/routes/stats/analytics.ts` — Update handler to call film service, reshape response to match contract
- `api/services/fakes/services.ts` — Add fake for HaloFilmService (or extend AnalyticsService fake)

**Tests**:

- Film fetch: metadata parsing, chunk download mock, decompression
- Event parsing: marker detection, XUID extraction, type hint classification
- Kill matrix aggregation: pair matching, perfect count detection
- Caching: KV store hit/miss behavior
- Service roundtrip: fetch → parse → aggregate → response shape matches contract

### **PR 2b: Frontend Tabs & Kill Matrix Display** (Stage 2, Slice 2)

- **Goal**: Wire UI consumption across Match Stats, Series Stats, Individual Tracker Viewer
- **Size**: ~300 lines
- (Proceed after PR 2a validation on real data)

---

## Old PR Breakdown (Archive)

---

## Phase 2 Readiness (Score Progression)

**No changes to contract or routes needed**. Just extend:

1. Film extractor: compute score progression events (already in FILM_EXPLORER_PROGRESS baseline)
2. Contract: add optional `scoreProgression` module
3. New tab component: `ScoreProgressionChart`
4. Presenter: interpolate timeline, handle mode-specific scoring
5. All three stats paths benefit automatically (no duplication)

---

## Implementation Checklist: Stage 2

- [x] PR 2a: HaloFilmService (or AnalyticsService direct) + film fetching/parsing
  - [x] Adapt auth context resolution (env tokens → repo auth fallback)
  - [x] Implement film metadata fetch + chunk download
  - [x] Port bit-level parsing and event extraction logic from prototype
  - [x] Implement kill matrix aggregation from parsed events
  - [x] Add KV-backed caching for metadata + parsed chunks
  - [x] Update route handler to call service + reshape response
  - [x] Tests: fetch, parse, aggregate, cache behavior
  - [x] Validate against live match data
- [ ] PR 2b: Tab shell component + stats UI integration
  - [ ] Create TabbedSection component
  - [ ] Refactor Individual Tracker Manager to use tabs
  - [ ] Add Kill Matrix tab to Match Stats
  - [ ] Add Kill Matrix tab to Series Stats
  - [ ] Add Kill Matrix tab to Individual Tracker Viewer
- [ ] Post-UI follow-up: fix advanced stat extraction/display wiring (perfects, headshots, etc.) and verify end-to-end in API + UI
- [ ] Post-UI follow-up: optimize bit-scanning performance in `parseHighlightEvents` (per-bit extraction in hot loop is CPU-expensive; refactor to byte-level scanning with fallback to bit-checks only around candidate regions, or implement bit-pattern search operating on words/bytes)
- [ ] Regression testing across all three stats paths
- [x] Format + lint + typecheck on each PR

---

## Stage 2 Decisions Finalized

1. **Service Architecture** ✓
   - Option A (HaloFilmService in `api/services/halo/`) or Option B (direct in AnalyticsService)
   - Decision: Choose after initial PR 2a implementation; both paths viable <500 LOC
   - HaloFilmService is cleaner for reuse if other services need film later

2. **Auth Pattern Reuse** ✓
   - Use existing `CustomSpartanTokenProvider` + `XboxService` for repo auth fallback
   - No new auth flow; integrate with existing patterns per AGENTS.md

3. **Film Data Caching** ✓
   - KV store: `env.APP_DATA` (Cloudflare Worker KV)
   - Keys: `film:metadata:{matchId}`, `film:chunk:{matchId}:{chunkIndex}`
   - TTL: `31536000` (1 year, immutable data)
   - Hit rate: 100% after first request per unique match

4. **Prototype Integration** ✓
   - Do NOT copy prototype code directly to repo
   - Port logic patterns (auth resolution, bit parsing, aggregation) into service layer
   - Adapt types (HighlightEvent, KillPairing, etc.) into new service data structures
   - Prototype serves as reference only; service code must follow AGENTS.md strict mode

5. **Real Data Validation** ✓
   - Fixtures ready: CTF (eagle 3, cobra 2), KOTH (eagle 2 rounds, cobra 1), Strongholds (eagle 250, cobra 186)
   - Stage 2a (film integration) validated against live match data

6. **Performance Optimization** ⏳ (Deferred)
   - Current implementation: per-bit extraction in `parseHighlightEvents` loop
   - Concern: CPU-expensive for realistically-sized film chunks; potential Cloudflare Workers CPU limit exceedance
   - Solution path: refactor to byte-level scanning with bit-level fallback around candidate event markers
   - Timing: Post-UI validation (Stage 2b), when real chunk size data and benchmarks are available
   - Blocking status: No (current throughput acceptable for MVP; optimize with evidence post-launch)
   - All extracted with zero player validation mismatches
   - Kill matrix aggregation tested on 5 real matches (Slayer, KOTH, CTF, Oddball, Strongholds)

## Old Decisions Finalized (Archive)

---

## Files Summary: Stage 2

### Create (PR 2a: Backend)

1. `api/services/halo/halo-film.ts` (Option A) OR extend AnalyticsService directly (Option B)
   - Film metadata fetch, chunk download, binary parsing, kill matrix aggregation
   - Caching via `env.APP_DATA`
   - ~350 LOC

### Create (PR 2b: Frontend)

2. `pages/src/components/shared/tabbed-section/tabbed-section.tsx`
3. `pages/src/components/shared/tabbed-section/tabbed-section.module.css`
4. `pages/src/components/shared/tabbed-section/types.ts`
5. `pages/src/components/stats/kill-matrix/kill-matrix-table.tsx`
6. `pages/src/components/stats/kill-matrix/kill-matrix-table.module.css`
7. `pages/src/components/stats/kill-matrix/kill-matrix-presenter.ts`
8. `pages/src/components/stats/kill-matrix/kill-matrix-store.ts`
9. `pages/src/components/stats/kill-matrix/types.ts`

### Modify (PR 2a: Backend)

1. `api/services/install.ts` — Register HaloFilmService if Option A
2. `api/routes/stats/analytics.ts` — Update handler to use film service
3. `api/services/fakes/services.ts` — Add fake for film service

### Modify (PR 2b: Frontend)

4. `pages/src/components/stats/match-stats.tsx` — Add TabbedSection with Kill Matrix tab
5. `pages/src/components/stats/series-stats.tsx` — Add TabbedSection with Kill Matrix tab
6. `pages/src/components/individual-tracker-manager/individual-tracker.tsx` — Refactor to use TabbedSection
7. `pages/src/components/individual-tracker/viewer/stats-panel.tsx` (or equiv.) — Add Kill Matrix tab
8. `pages/src/apps/discord-series-stats/services.ts` — Add analytics service export
9. `pages/src/apps/individual-tracker-viewer/services.ts` — Add analytics service export

### Reference (Not Copied; Prototype Only)

- `extractor.ts` — Film auth/fetch/parse/aggregation logic patterns
- `types.ts` — Film data structures (adapt into service layer)

---

## Next Steps

### Immediate (Stage 2, Slice 1)

1. Choose service architecture: Option A (HaloFilmService) or Option B (AnalyticsService direct)
2. Implement film fetch/parse service using prototype (`extractor.ts`, `types.ts`) as reference
3. Validate on real matches (CTF, KOTH, Strongholds fixtures ready)
4. Merge PR 2a
5. Proceed to PR 2b (frontend UI) only after backend validation

### Then (Stage 2, Slice 2)

6. Build tab shell component and integrate across all three stats paths
7. Add Kill Matrix display component
8. Merge PR 2b

### Phase 2 (Later)

9. Extend film service to parse score progression events
10. Add ScoreProgressionChart component
11. No contract/route changes needed (extensible design ready in Stage 1)
