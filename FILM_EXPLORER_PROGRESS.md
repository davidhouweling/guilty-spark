# Film Explorer PoC Progress

**Last Updated**: May 6, 2026  
**Worktree**: `guilty-spark-film-explorer` (branch `film-explorer` from `main`)  
**Current Status**: KOTH hill progression model implemented and theater-validated; CTF/Oddball/Strongholds baseline data ready

---

## Summary of Completed Work

### 1. Real Match Extraction Proven

- **Goal**: Establish end-to-end film data fetch and parsing capability before diving deep on parsing.
- **Status**: ✅ Complete
- **Output**: Successfully extracted 5 real matches (Slayer, KOTH, CTF, Oddball, Strongholds) with zero authentication churn and stable film fetches.
- **Files Generated**:
  - `api/scripts/film-output/slayer-08612651-4459-43e7-aa8c-b8f8f7f5cd99.json`
  - `api/scripts/film-output/koth-8ee08b99-fa51-4681-b600-c9790bfeee5c.json`
  - `api/scripts/film-output/ctf-63d3d74e-bff4-4f34-ac93-c644c073d6f1.json`
  - `api/scripts/film-output/oddball-734aa3b5-b416-4e62-be9a-ba6f852d2ee9.json`
  - `api/scripts/film-output/strongholds-8cb79d40-175e-4888-a526-4af063cf2d66.json`

#### Match Baseline Data

| Match       | Mode | Film Ver | Events | Kills | Deaths | Medals | Mode Markers | Final Score            | Validation Mismatches |
| ----------- | ---- | -------- | ------ | ----- | ------ | ------ | ------------ | ---------------------- | --------------------- |
| Slayer      | 6    | 41       | 231    | 94    | 95     | 42     | 0            | T0: 50, T1: 43         | 0                     |
| KOTH        | 12   | 41       | 353    | 125   | 125    | 58     | 45           | T0: 2R, T1: 1R         | 0                     |
| CTF         | 15   | 41       | 444    | 156   | 156    | 87     | 45           | T0: 3, T1: 2           | 0                     |
| Oddball     | 18   | 41       | 752    | 245   | 245    | 122    | 140          | T0: 209pts, T1: 256pts | 0                     |
| Strongholds | 11   | 41       | 395    | 131   | 131    | 63     | 70           | T0: 250, T1: 186       | 0                     |

All matches achieved perfect validation reconciliation (parsed kills/deaths/medals match match stats exactly).

---

### 2. Auth Context Caching

- **Goal**: Avoid repeated Xbox authentication when extracting multiple matches in one process.
- **Status**: ✅ Complete
- **File Modified**: `api/scripts/film/extractor.ts`
- **Change**: Added `authContextPromise` module-level cache in `resolveAuthContext()` so auth is resolved once per process, not per match.
- **Impact**: Reduces authentication churn; safe for batch extraction runs.

---

### 3. Output File Naming Convention

- **Goal**: Make extracted artifacts immediately identifiable by mode type.
- **Status**: ✅ Complete
- **Change**: Renamed all generated JSON files to include mode prefix (e.g., `koth-<matchId>.json`).
- **Benefit**: Easier visual scanning and organization of baseline data.

---

### 4. King of the Hill (KOTH) Hill Progression Model

- **Goal**: Implement a heuristic first-pass reconstruction of KOTH hill occupancy and scoring using mode events.
- **Status**: ✅ Implemented and Theater-Validated

#### Implementation Details

**Types Added** (`api/scripts/film/types.ts`):

```typescript
export interface KothProgressPoint {
  timeMs: number;
  xuid: string;
  gamertag: string;
  teamId: number;
  teamCumulativeTicks: number;
}

export interface KothHillWindow {
  hillIndex: number;
  startTimeMs: number;
  endTimeMs: number | null;
  scoredByTeamId: number | null;
  scoredAtMs: number | null;
  progressPoints: KothProgressPoint[];
}

export interface KothHillTimeline {
  ticksPerPoint: number;
  hills: KothHillWindow[];
}
```

**Builder Function** (`api/scripts/film/extractor.ts`):

- `buildKothHillTimeline(modeEvents: HighlightEvent[]): KothHillTimeline`
- Constants: `KOTH_TICKS_PER_POINT = 8`
- Logic:
  1. Sort mode events by timestamp (all already filtered to have teamId)
  2. Accumulate ticks per team per hill window
  3. When a team reaches 8 ticks, create a hill window with that team as scorer
  4. Reset both teams' tick counts and start new hill at scoring moment
  5. Any remaining incomplete hill appended with `scoredByTeamId: null`

**Output Structure**:

- Wired into `FilmTimelineOutput.timelines.kothHills` (null for non-KOTH modes)
- Limited to KOTH matches via `GameVariantCategory.MultiplayerKingOfTheHill` check

#### Theater Validation Results (KOTH match 8ee08b99-fa51-4681-b600-c9790bfeee5c)

**Hill 1** (0:57–3:07):

- Model: Team 0 scores at 3:07 via xCharmira
- Theater: ✅ Confirmed — xCharmira in hill, team 0 scores at 3:07
- Team 0: 8 ticks (SkiDaPow→soundmanD→TPG Driift→xCharmira)
- Team 1: 5 ticks (all harpeggio, 0:57–1:42)

**Hill 2** (3:07–4:45):

- Model: Team 0 scores at 4:45 via soundmanD
- Theater: ✅ Confirmed — soundmanD in hill uncontested 4:04–4:45
- **Parsing Gap Found**: harpeggio's mode events missing for 3:57–4:02 window despite confirmed in-game progress; likely dedup or film v41 encoding artifact
- Team 0: 8 ticks (soundmanD)
- Team 1: 2 ticks (TurtleNeckIt, StarWoIIf) — model shows incomplete capture

**Hill 3** (4:45–7:22):

- Model: Team 1 scores at 7:22 via harpeggio
- Theater: ✅ Confirmed — harpeggio scores hill 3 at 7:22
- Team 0: 6 ticks (TPG Driift, soundmanD)
- Team 1: 8 ticks (StarWoIIf, harpeggio)
- Theater note: gap at 6:23–6:51 where soundmanD killed, then StarWoIIf uncontested

**Hill 4** (7:22+, incomplete):

- Model: Hill spawns at 7:22, neither team reaches 8 ticks before match end
- Theater: ✅ Confirmed — new hill at 7:26, chaotic contested period with multiple short entries, match timer ends at 10:28 with neither team scoring
- Team 0: 5 ticks accumulated (xCharmira, soundmanD, others)
- Team 1: 3 ticks accumulated (AgentStaLLion)
- Final: 2–1 (Team 0 wins) ✅

#### Model Assumptions Validated

1. **Tick cadence**: Mode events occur ~1 per second during uncontested hill occupation
2. **Initial delay**: ~6 second delay before first tick after player enters hill
3. **Point threshold**: 8 ticks = 1 hill scored
4. **Reset**: Both teams' tick counts reset after a point is scored; new hill begins at scoring moment
5. **Silence inference**: No mode ticks = contest, empty hill, or dead/spectating period (model infers from gaps)

#### Known Parsing Gaps

- **Missing harpeggio events (Hill 2)**: Despite confirmed in-game progress accumulation, harpeggio's mode events at 3:57–4:02 do not appear in extracted stream. Likely causes:
  - Dedup logic is too aggressive (same player on same team in consecutive ticks)
  - Film major version 41 has encoding quirk for rapid consecutive mode pulses
  - Decision: Investigate if higher priority; does not break visualization viability
- **Hill boundary timing offset**: Model infers hill spawn at score time; actual hill spawns ~4 seconds later in theater

---

## Current Code State

### Files Modified

1. **`api/scripts/film/types.ts`**
   - Added: `KothProgressPoint`, `KothHillWindow`, `KothHillTimeline` interfaces
   - Modified: `FilmTimelineOutput.timelines` now includes `kothHills: KothHillTimeline | null`

2. **`api/scripts/film/extractor.ts`**
   - Added: `buildKothHillTimeline()` function (50 lines)
   - Modified: `resolveAuthContext()` with module-level caching
   - Modified: `buildLimitations()` to describe KOTH heuristic approach
   - Wired: KOTH builder called for `GameVariantCategory.MultiplayerKingOfTheHill`

3. **`api/scripts/extract-film-timeline.ts`**
   - No changes (entrypoint unchanged)

4. **`api/package.json`**
   - No changes (script `film:extract` already present)

### Test Status

- `npm run typecheck --workspace=api` ✅ passes
- No unit tests added yet (PoC stage)

---

## Remaining Parsing Baseline Data (Not Yet Decoded)

### CTF (63d3d74e-bff4-4f34-ac93-c644c073d6f1)

- **Final Score**: Team 0 (Eagle) 3 caps, Team 1 (Cobra) 2 caps
- **Mode Markers**: 45 total
- **Status**: Ready for similar heuristic model implementation
- **Expected Model**: Flag pickup/drop/capture events; cap progress per team

### Oddball (734aa3b5-b416-4e62-be9a-ba6f852d2ee9)

- **Final**: Team 0 (Eagle) 2 rounds won (209 points), Team 1 (Cobra) 1 round won (256 points)
- **Mode Markers**: 140 total
- **Status**: Ready for round/possession decoding
- **Expected Model**: Oddball pickup, round timer, cumulative points per team

### Strongholds (8cb79d40-175e-4888-a526-4af063cf2d66)

- **Final**: Team 0 (Eagle) 250 points, Team 1 (Cobra) 186 points
- **Mode Markers**: 70 total
- **Status**: Ready for zone control decoding
- **Expected Model**: Zone captures, occupancy overlap, point accumulation

---

## Next Steps (Not Yet Executed)

### Option A: CTF Decoding (Recommended)

1. Apply same heuristic model to CTF mode markers (~5s tick cadence assumption)
2. Gather theater observations for 2–3 flag captures
3. Validate scoring sequence and tick pattern
4. Decide between simple possession ticks vs. distinct pickup/drop/carry events

### Option B: Chart Visualization Skeleton

1. Create Astro component for horizontal timeline visualization
2. Team bifurcated lines (team 0 above center, team 1 below)
3. Progress bars for each hill/round/zone
4. Layer toggle UI for kills, medals, alive advantage, power items
5. Start with KOTH as proof-of-concept

### Option C: Alive Advantage Overlay

1. Compute player alive/dead state from kill/death event stream
2. Infer team player count over time
3. Correlate with hill progress gaps (is team silence due to being outnumbered?)

### Option D: Parsing Gap Investigation

1. Extract raw film v41 decompressed chunk data
2. Analyze harpeggio mode event sequence in hill 2
3. Determine if dedup, encoding, or parser logic is culprit
4. Build targeted fix if high-impact

### Current Recommendation

**Pursue Option A (CTF) + Option B (Chart) in parallel**:

- CTF will validate whether heuristic model generalizes to other modes
- Chart skeleton gives early visual validation of the entire concept
- If both succeed, you have a unified visualization template for all 5 modes

---

## How to Resume

### Local Environment

- Worktree: `guilty-spark-film-explorer`
- Branch: `film-explorer`
- API workspace: `api/`
- Auth: Uses `api/.env` via dotenv (script never reads env directly)

### Run Current Extraction

```bash
cd api
npm run film:extract <matchId> [outputPath]
```

### Verify KOTH Model Output

```bash
node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync("scripts/film-output/koth-<matchId>.json", "utf8"));
console.log(JSON.stringify(data.timelines.kothHills, null, 2));
'
```

### Typecheck

```bash
npm run typecheck --workspace=api
```

---

## Reference: Theater Observation Capture Format

For gathering next set of observations (CTF, Oddball, Strongholds), use this compact format:

```
Mode: <CTF/Oddball/Strongholds>
Match ID: <id>
Observer Notes:

<Event Name>: <player name> <action> at <time>
<Event Name>: <player name> <action> at <time>
...

Example (CTF):
- SkiDaPow flags at 1:23
- xCharmira caps flag at 2:15
- harpeggio flags at 2:33
- soundmanD intercepts at 2:40
```

---

## Key Insights So Far

1. **Film data is stable and fetchable**: All 5 matches extracted cleanly with perfect kill/death/medal reconciliation.
2. **Mode events are roughly regular**: ~1 tick per second during uncontested occupancy, ~6s initial delay before first tick.
3. **Heuristic models work**: KOTH 8-tick-per-point model correctly reconstructed all 3 scored hills and match outcome.
4. **Minor parsing gaps exist**: Harpeggio's events missing in one hill window; not blocking but worth investigating.
5. **Theater comparison is the key validator**: Player observations (via film theater mode) are the ground truth for calibration.
6. **Visualization-first design**: Chart visualization should start with coarse per-hill/round/zone progress, not frame-level precision.

---

## Questions to Return With

- Which mode to tackle next (CTF, Oddball, or Strongholds)?
- Do you want to continue with heuristic models or investigate parsing gaps first?
- What visualization framework preference (Astro component, standalone web app, or embedded in pages/)?
- How important is real-time/interactive features vs. static chart generation?
