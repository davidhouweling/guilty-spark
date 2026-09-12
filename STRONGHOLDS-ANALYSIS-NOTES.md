# Strongholds score-progression — working notes (NOT checked in)

Branch: feat/strongholds-graph. Theatre ground truth: match 2104a978-6965-4ea2-831a-f5eb661ae1ea
(the earlier 9b15b756 id was WRONG — different match; its data coincidentally similar).
Script: api/scripts/strongholds-analysis.ts <matchId> [--events] [--byte2].

## Data model (2104a978, Eagle 250 : Cobra 188 — API matches HUD exactly)

- Mode 11. First to 250. T0=Eagle=winner here (repo convention holds; verify per match).
- ZonesStats: StrongholdScoringTicks = scoring SECONDS; CoreStats.Score = POINTS.
  **Score − ticks = seconds at triple-zone double rate** (E: 250−237=13, C: 188−185=3) —
  free solver constraint. Duration 684s ≈ in-game clock (offset ~0-1s this match).
- Film mode events = per-player capture + secure credits (deduped groups = Captures+Secures:
  E 30=23+7, C 24=21+3). Envelope: byte 36 = player slot, bytes 37-38 = team, ts 48-51 BE.
  NO capture/secure subtype byte.
- **SECURE = denial/reset event** (enemy attempt on your zone cleared; progress → 0),
  timestamped at the reset. Verified: E secures = user's 6 logged resets + 1 unlogged (9:54);
  C secures = exactly the 3 logged resets.
- **Single-credit rule: every secure credits exactly ONE player** (per-player secures sum ==
  team secures in both matches). Multi-credit group ⇒ certainly a CAPTURE.

## Scoring rules (validated, waypoint MAE ~2 supervised)

- Points: 1/s at 2 effective zones, 2/s at 3; ticks: 1/s whenever scoring.
- Zone effective for owner only while no enemy stands in it; enemy attempt windows
  approximated [t − W, t] ending at the capture (flipped zone) or secure (own zone), W≈6.5s
  (reconciled MAE robust for W∈[5.5,7]).
- Ownership: capture flips (+1 self; −1 enemy, or from neutral while neutral remains).
  Initial state (1,1) spawn-owned in both observed matches (B neutral).
- Counts-only model — zone identity not needed (and not recoverable, per LevelUp).

## Solver (feasibility PROVEN on 2104a978)

1. Dedupe film mode events → (time, team, credits) groups.
2. Multi-credit groups = captures. Choose secures among single-credit groups only:
   quotas from API (Captures/Secures per team). Enumerate combos (this match: C(16,7)×C(11,3)
   → 70k validity-passing candidates; cap with beam fallback if it explodes).
3. Validity: zone counts stay legal (0..3, capture needs available enemy/neutral zone).
4. Objective: |Δpoints| + |Δticks| + 2|Δtriple-seconds| vs API, both teams.
5. Winner: 50/54 label accuracy, reconciled waypoint MAE E=1.8 C=0.4 (beats true labels'
   1.9/1.7 — mislabels absorb unmodeled contests). True labeling ranks #5.
6. Reconcile winning curve per team to API Score exactly; output (timestampMs, runningScores)
   → existing score-lines UI (delta chart free). Zones gantt deferred (zone identity).
7. Production perf: integrate piecewise-analytically over event/window breakpoints (~200
   segments), NOT dt-stepping; ~70k×200 ops is Worker-safe. Cap enumeration; beam fallback.

## LevelUp corroboration (../LevelUp/.ai/ETAT_DE_L_ART_MODE_SCORE_EVENEMENTS.md)

- Zone-mode footer events = per-player capture/secure credits, exact vs API (8/9 films).
- Zone identity (A/B/C): established NEGATIVE. Exact score curve exists in film (statborg
  archetype-6 component 0) but offline extraction unsolved (23.7% recall). Their KOTH 5.00s
  tick cadence confirms our shipped KOTH; their PR752/753 refutations target pre-#757
  abandoned claims — shipped code unaffected.

## Theatre labels for 2104a978 (film s ≈ in-game s; E=T0)

E caps: 39.9, 50.5, 79.9, 120.2, 125.7, 198.1, 234.5, 281.6, 301.9, 351.2, 358.3, 368.0,
415.4, 490.7, 493.7, 516.7, 533.8, 561.5, 576.2 (unlogged), 629.1, 641.2, 658.1, 664.5 (23)
E secs: 102.7, 418.5, 442.8, 502.1, 551.7, 594.9 (unlogged), 680.9 (7)
C caps: 51.7, 57.8, 84.2, 127.0, 191.3, 205.0, 231.8, 286.6, 322.1, 343.8, 366.1, 399.8,
473.7, 495.7, 519.4, 535.3, 556.0, 579.2, 599.2, 625.8, 649.7 (21)
C secs: 224.6, 328.0, 444.3 (3)

## Waypoints (s → E:C points) for EXPECTED validation

42→3:0, 45→6:0, 72→6:15, 94→6:27, 113→6:45, 126→8:45, 185→66:45, 220→67:58, 233→67:63,
274→67:104, 293→67:112, 314→80:112, 334→80:119, 350→80:136, 367→82:137, 392→103:137,
407→103:145, 417→105:147, 427→114:147, 443→127:147, 466→150:147, 494→153:157, 511→164:157,
527→176:157, 534→178:157, 548→189:157, 577→202:157, 586→209:157, 597→211:157, 616→211:176,
628→211:180, 648→213:186, 664→219:188, 671→235:188, 683→250:188.

## Next

1. Implement api/services/halo/modes/strongholds/strongholds-progression.ts (piecewise
   integration + capped enumeration/beam + reconciliation) mirroring modes/oddball structure.
2. strongholds-validate-match.ts with EXPECTED waypoints; pin 2104a978 fixture.
3. Blind-test on 9b15b756 (API 250:160 — full ground truth unknown but totals + capture
   counts known) and future matches from user.
4. Wire "strongholds" into analytics as score-lines timeline (reuse kill-race-style contract
   variant? needs its own variant since events differ — decide at contract time).

## Dead ends (do not retry)

- byte2 zone states (slow global counter in 9b15b756; richer in 2104a978 but uncorrelated).
- Envelope subtype byte for capture-vs-secure (bytes 32-46/52-54 fully accounted).
- Naive rate model without presence windows (over-scores ~40%).
