import { describe, expect, it } from "vitest";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getMatchStats } from "../../../fakes/data";
import { buildKothProgression } from "../koth-progression";
import type { ParsedHighlightEvent, StateByte2Transition } from "../../../types";

function modeEvent(teamId: number, timeMs: number): ParsedHighlightEvent {
  return {
    xuid: `010000000000000${teamId.toString()}`,
    gamertag: "player",
    typeHint: 0,
    isMedal: false,
    eventType: "mode",
    timeMs,
    medalValue: 0,
    teamId,
  };
}

function tickBurst(teamId: number, startMs: number, count: number): ParsedHighlightEvent[] {
  return Array.from({ length: count }, (_, tickIndex) => modeEvent(teamId, startMs + tickIndex * 5000));
}

function transition(timeMs: number, fromValue: number, toValue: number): StateByte2Transition {
  return { timeMs, fromValue, toValue };
}

// koth.json: Eagle (team 0) = 3 captures, Cobra (team 1) = 2 captures → 5 total.
function kothMatchStats(): MatchStats {
  return Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth"));
}

describe("buildKothProgression", () => {
  it("derives hill capture timestamps from score events matching each team's capture count", () => {
    // 8 ticks × 5s cadence = the 40s capture meter; each burst captures and relocates the hill.
    const modeEvents = [
      ...tickBurst(0, 5000, 8), // Location A: Team 0 captures at 40000
      ...tickBurst(1, 70000, 8), // Location B: Team 1 captures at 105000
      ...tickBurst(0, 140000, 8), // Location C: Team 0 captures at 175000
      ...tickBurst(1, 220000, 8), // Location D: Team 1 captures at 255000
      ...tickBurst(0, 300000, 8), // Location E: Team 0 captures at 335000, ending the match
    ];
    const byte2Transitions = [
      transition(40500, 0x40, 0x41), // end of Location A control
      transition(45000, 0x41, 0x42), // start of Location B control
      transition(105500, 0x42, 0x43), // end of Location B control
      transition(110000, 0x43, 0x44), // start of Location C control
      transition(175500, 0x44, 0x45), // end of Location C control
      transition(180000, 0x45, 0x46), // start of Location D control
      transition(255500, 0x46, 0x47), // end of Location D control
      transition(260000, 0x47, 0x48), // start of Location E control
    ];

    const result = buildKothProgression(modeEvents, byte2Transitions, kothMatchStats(), 732278);

    expect(result.teamCount).toBe(2);
    expect(result.hillCaptureTimestamps).toEqual([40000, 105000, 175000, 255000, 335000]);
    expect(result.events).toHaveLength(40);
    expect(result.controlPeriods).toHaveLength(9);
  });

  it("includes the match-end capture when per-location tick counts are uneven across hills", () => {
    // Loc E has 10 ticks instead of 8. The 8-tick reading of Loc E (capture at 335000) is
    // rejected because the next tick lands 5000ms later — inside the relocation quiet gap —
    // so the capture must be the uneven 10-tick match-end event at 345000.
    const modeEvents = [
      ...tickBurst(0, 5000, 8), // Loc A: Team 0 captures at 40000
      ...tickBurst(1, 70000, 8), // Loc B: Team 1 captures at 105000
      ...tickBurst(0, 140000, 8), // Loc C: Team 0 captures at 175000
      ...tickBurst(1, 220000, 8), // Loc D: Team 1 captures at 255000
      ...tickBurst(0, 300000, 10), // Loc E: 10 T0 ticks — uneven, ends the match at 345000
    ];
    const byte2Transitions = [
      transition(40500, 0x40, 0x41),
      transition(45000, 0x41, 0x42),
      transition(105500, 0x42, 0x43),
      transition(110000, 0x43, 0x44),
      transition(175500, 0x44, 0x45),
      transition(180000, 0x45, 0x46),
      transition(255500, 0x46, 0x47),
      transition(260000, 0x47, 0x48),
    ];

    const result = buildKothProgression(modeEvents, byte2Transitions, kothMatchStats(), 732278);

    expect(result.hillCaptureTimestamps).toEqual([40000, 105000, 175000, 255000, 345000]);
  });

  it("returns empty hillCaptureTimestamps when no byte2 transitions are available", () => {
    const modeEvents = [modeEvent(0, 5000), modeEvent(0, 10000)];

    const result = buildKothProgression(modeEvents, [], kothMatchStats(), 300000);

    expect(result.hillCaptureTimestamps).toEqual([]);
    expect(result.controlPeriods).toEqual([]);
  });

  it("deduplicates mode events within 2500ms of the same team", () => {
    const modeEvents = [
      // Two Team 0 events within 2500ms — only the first counts
      modeEvent(0, 5000),
      modeEvent(0, 5001),
      modeEvent(0, 10000),
      modeEvent(0, 15000),
      modeEvent(0, 20000),
      // Team 1 ends the match
      modeEvent(1, 200000),
    ];
    const byte2Transitions = [transition(20500, 0x40, 0x41), transition(25000, 0x41, 0x42)];

    const result = buildKothProgression(modeEvents, byte2Transitions, kothMatchStats(), 300000);

    expect(result.events).toHaveLength(5);
    expect(result.events[0]).toMatchObject({ timestampMs: 5000, teamId: 0 });
    expect(result.events[1]).toMatchObject({ timestampMs: 10000, teamId: 0 });
  });

  it("does not treat trailing uncaptured-hill ticks at match end as a capture", () => {
    // koth.json: Eagle=3, Cobra=2 → 5 total captures
    const modeEvents = [
      ...tickBurst(0, 5000, 8), // Location A: Eagle captures at 40000
      ...tickBurst(1, 70000, 8), // Location B: Cobra captures at 105000
      ...tickBurst(0, 140000, 8), // Location C: Eagle captures at 175000
      ...tickBurst(1, 220000, 8), // Location D: Cobra captures at 255000
      ...tickBurst(0, 300000, 8), // Location E: Eagle captures at 335000
      // Location F: match ends on time — hill never captured, these ticks must NOT become a capture
      modeEvent(0, 395000),
      modeEvent(0, 400000),
    ];
    const byte2Transitions = [
      transition(40500, 0x40, 0x41),
      transition(45000, 0x41, 0x42),
      transition(105500, 0x42, 0x43),
      transition(110000, 0x43, 0x44),
      transition(175500, 0x44, 0x45),
      transition(180000, 0x45, 0x46),
      transition(255500, 0x46, 0x47),
      transition(260000, 0x47, 0x48),
      transition(335500, 0x48, 0x49), // Location E ends → F begins
      transition(340000, 0x49, 0x4a),
    ];

    const result = buildKothProgression(modeEvents, byte2Transitions, kothMatchStats(), 732278);

    // All 5 captures fit the 8-tick pattern — the 2 trailing ticks on Location F
    // are not a capture, so matchEndEvent (400000) must NOT appear.
    expect(result.hillCaptureTimestamps).toEqual([40000, 105000, 175000, 255000, 335000]);
  });

  it("falls back to the captures that fit the events when match scores exceed available ticks", () => {
    const modeEvents = [
      modeEvent(0, 5000),
      modeEvent(0, 10000),
      modeEvent(0, 15000),
      modeEvent(0, 20000),
      modeEvent(0, 25000),
    ];
    // koth.json says Eagle=3, Cobra=2 but only one 5-tick Eagle hill exists in the film events.
    const byte2Transitions = [transition(25001, 0x40, 0x41), transition(30000, 0x41, 0x42)];

    const result = buildKothProgression(modeEvents, byte2Transitions, kothMatchStats(), 300000);

    expect(result.hillCaptureTimestamps).toEqual([25000]);
  });

  it("attributes a contested hill to the team whose captures fit the match score", () => {
    // Hill 1: Team 1 has 7 ticks (majority in the hill), Team 0 has 6 ticks including the
    // final tick at 49000ms. Events are spaced 3000ms apart to avoid the 2500ms dedup window.
    // Team 1 capturing hill 1 leaves no room for Team 0's three captures (match score 3:2),
    // so the only assignment fitting both scores gives hill 1 to Team 0 at 49000ms.
    const modeEvents = [
      // Hill 1: T0=6 ticks (3000ms spacing), T1=7 ticks (3000ms spacing), T0 last tick at 49000ms
      modeEvent(0, 5000),
      modeEvent(0, 8000),
      modeEvent(0, 11000),
      modeEvent(0, 14000),
      modeEvent(0, 17000),
      modeEvent(1, 18500),
      modeEvent(1, 21500),
      modeEvent(1, 24500),
      modeEvent(1, 27500),
      modeEvent(1, 30500),
      modeEvent(1, 33500),
      modeEvent(1, 36500),
      modeEvent(0, 49000), // most recent tick before gap at 50000ms
      // Hills 2–5 (single-team, 3000ms spacing, Eagle=3 total, Cobra=2 total)
      modeEvent(1, 100000),
      modeEvent(1, 103000),
      modeEvent(1, 106000),
      modeEvent(1, 109000),
      modeEvent(1, 112000), // Hill 2: Cobra
      modeEvent(0, 160000),
      modeEvent(0, 163000),
      modeEvent(0, 166000),
      modeEvent(0, 169000),
      modeEvent(0, 172000), // Hill 3: Eagle
      modeEvent(1, 220000),
      modeEvent(1, 223000),
      modeEvent(1, 226000),
      modeEvent(1, 229000),
      modeEvent(1, 232000), // Hill 4: Cobra
      modeEvent(0, 280000),
      modeEvent(0, 283000),
      modeEvent(0, 286000),
      modeEvent(0, 289000),
      modeEvent(0, 292000), // Hill 5: Eagle
    ];
    const byte2Transitions = [
      transition(5000, 0x40, 0x41),
      transition(50000, 0x41, 0x42),
      transition(95000, 0x42, 0x43),
      transition(115000, 0x43, 0x44),
      transition(155000, 0x44, 0x45),
      transition(175000, 0x45, 0x46),
      transition(215000, 0x46, 0x47),
      transition(235000, 0x47, 0x48),
      transition(275000, 0x48, 0x49),
      transition(295000, 0x49, 0x4a),
    ];

    const result = buildKothProgression(modeEvents, byte2Transitions, kothMatchStats(), 732278);

    // hillCaptureTimestamps[0] must be 49000ms (Team 0's capture) not 36500ms (Team 1's last
    // tick) — only Team 0 capturing hill 1 allows all five captures in the match score to fit.
    expect(result.hillCaptureTimestamps).toEqual([49000, 112000, 172000, 232000, 292000]);
  });

  it("returns empty when no mode events are present", () => {
    const result = buildKothProgression([], [transition(100000, 0x40, 0x41)], kothMatchStats(), 300000);

    expect(result.hillCaptureTimestamps).toEqual([]);
    expect(result.events).toHaveLength(0);
  });
});
