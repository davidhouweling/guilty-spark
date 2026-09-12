import { describe, expect, it } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getMatchStats } from "../../../fakes/data";
import type { ParsedHighlightEvent } from "../../../types";
import { buildStrongholdsProgression, sampleScoreAt } from "../strongholds-progression";
import type { StrongholdsProgression } from "../strongholds-progression";
import { aFakeStrongholdsMatchStatsWith } from "../fakes/strongholds-match-stats.fake";
import {
  strongholds2104Events,
  STRONGHOLDS_2104_DURATION_MS,
  STRONGHOLDS_2104_THEATRE_WAYPOINTS,
} from "../fakes/strongholds-match-2104.fake";

// Theatre-verified match 2104a978 (Eagle=team 0 250 : Cobra=team 1 188).
function build2104(): StrongholdsProgression {
  const matchStats = aFakeStrongholdsMatchStatsWith(
    new Map([
      [0, { score: 250, ticks: 237, captures: 23, secures: 7 }],
      [1, { score: 188, ticks: 185, captures: 21, secures: 3 }],
    ]),
  );
  return buildStrongholdsProgression(strongholds2104Events(), matchStats, STRONGHOLDS_2104_DURATION_MS);
}

describe("buildStrongholdsProgression", () => {
  it("reports the team count from match stats", () => {
    expect(build2104().teamCount).toBe(2);
  });

  it("reconciles the final running scores exactly to the API team scores", () => {
    const progression = build2104();
    const last = Preconditions.checkExists(progression.events.at(-1));
    expect(last.runningScores).toEqual({ "0": 250, "1": 188 });
    expect(last.timestampMs).toBe(STRONGHOLDS_2104_DURATION_MS);
  });

  it("emits monotonically non-decreasing scores for both teams", () => {
    expect.assertions(2);
    const progression = build2104();
    for (const teamId of [0, 1]) {
      const values = progression.events.map((point) => point.runningScores[String(teamId)] ?? 0);
      const sorted = [...values].sort((a, b) => a - b);
      expect(values).toEqual(sorted);
    }
  });

  it("tracks the theatre waypoints within a mean absolute error of 3 points", () => {
    const progression = build2104();
    let totalError = 0;
    const errors = STRONGHOLDS_2104_THEATRE_WAYPOINTS.map(([seconds, eagle, cobra]) => {
      const errorEagle = Math.abs(sampleScoreAt(progression.events, 0, seconds * 1000) - eagle);
      const errorCobra = Math.abs(sampleScoreAt(progression.events, 1, seconds * 1000) - cobra);
      totalError += errorEagle + errorCobra;
      return [seconds, errorEagle, errorCobra];
    });
    const meanError = totalError / (STRONGHOLDS_2104_THEATRE_WAYPOINTS.length * 2);
    expect(meanError, JSON.stringify(errors)).toBeLessThanOrEqual(3);
  });

  it("stays within 8 points of the theatre reading at every waypoint", () => {
    expect.assertions(STRONGHOLDS_2104_THEATRE_WAYPOINTS.length * 2);
    const progression = build2104();
    for (const [seconds, eagle, cobra] of STRONGHOLDS_2104_THEATRE_WAYPOINTS) {
      expect(Math.abs(sampleScoreAt(progression.events, 0, seconds * 1000) - eagle)).toBeLessThanOrEqual(8);
      expect(Math.abs(sampleScoreAt(progression.events, 1, seconds * 1000) - cobra)).toBeLessThanOrEqual(8);
    }
  });

  it("keeps the curve flat across a scoreless stretch", () => {
    // theatre: Eagle sat on 67 points from ~3:53 to ~4:53 while holding a single zone
    const progression = build2104();
    const gained = sampleScoreAt(progression.events, 0, 290000) - sampleScoreAt(progression.events, 0, 240000);
    expect(gained).toBeLessThanOrEqual(4);
  });

  it("falls back to a uniform ramp for a team with score but no attributable film events", () => {
    const matchStats = aFakeStrongholdsMatchStatsWith(
      new Map([
        [0, { score: 250, ticks: 237, captures: 23, secures: 7 }],
        [1, { score: 100, ticks: 100, captures: 0, secures: 0 }],
      ]),
    );
    const eagleOnlyEvents = strongholds2104Events().filter((event) => event.teamId === 0);
    const progression = buildStrongholdsProgression(eagleOnlyEvents, matchStats, STRONGHOLDS_2104_DURATION_MS);
    const midpoint = sampleScoreAt(progression.events, 1, STRONGHOLDS_2104_DURATION_MS / 2);
    expect(midpoint).toBeGreaterThan(30);
    expect(midpoint).toBeLessThan(70);
    const last = Preconditions.checkExists(progression.events.at(-1));
    expect(last.runningScores["1"]).toBe(100);
  });

  it("labels film groups beyond the API capture quota as secures instead of fabricating flips", () => {
    // three single-credit groups against a capture quota of 2: captures at 10s and 40s take
    // the neutral then the enemy zone, the 70s group is a cleared enemy attempt (secure) whose
    // window pauses the triple rate for 6.5s — integrating to 143.5 points / 90 ticks
    const matchStats = aFakeStrongholdsMatchStatsWith(
      new Map([
        [0, { score: 144, ticks: 90, captures: 2, secures: 0 }],
        [1, { score: 0, ticks: 0, captures: 0, secures: 0 }],
      ]),
    );
    const events = [10000, 40000, 70000].map((timeMs, index) => ({
      xuid: `21000000000100${String(index)}`,
      gamertag: `player-0-${String(index)}`,
      typeHint: 10,
      isMedal: false,
      eventType: "mode" as const,
      timeMs,
      medalValue: 33554432,
      teamId: 0,
    }));
    const progression = buildStrongholdsProgression(events, matchStats, 100000);
    const last = Preconditions.checkExists(progression.events.at(-1));
    expect(last.runningScores).toEqual({ "0": 144, "1": 0 });
    // a third flip would have collapsed the mid-match rate; the secure labeling holds ~79 at 65s
    expect(sampleScoreAt(progression.events, 0, 65000)).toBeGreaterThan(74);
    expect(sampleScoreAt(progression.events, 0, 65000)).toBeLessThan(84);
  });

  it("ignores film events recorded after the match duration", () => {
    const matchStats = aFakeStrongholdsMatchStatsWith(
      new Map([
        [0, { score: 250, ticks: 237, captures: 23, secures: 7 }],
        [1, { score: 188, ticks: 185, captures: 21, secures: 3 }],
      ]),
    );
    const spuriousTail = {
      xuid: "2100000000009999",
      gamertag: "player-0-tail",
      typeHint: 10,
      isMedal: false,
      eventType: "mode" as const,
      timeMs: STRONGHOLDS_2104_DURATION_MS + 5000,
      medalValue: 33554432,
      teamId: 0,
    };
    const withTail = buildStrongholdsProgression(
      [...strongholds2104Events(), spuriousTail],
      matchStats,
      STRONGHOLDS_2104_DURATION_MS,
    );
    expect(withTail.events).toEqual(build2104().events);
  });

  it("does not leave a team permanently contested by a group at the match start", () => {
    // a secure at t=0 has a zero-length attempt window; the multi-credit capture at 10s then
    // puts team 0 on two zones, so the curve must stay flat to 10s and ramp afterwards
    const matchStats = aFakeStrongholdsMatchStatsWith(
      new Map([
        [0, { score: 90, ticks: 90, captures: 1, secures: 1 }],
        [1, { score: 0, ticks: 0, captures: 0, secures: 0 }],
      ]),
    );
    const event = (timeMs: number, index: number): ParsedHighlightEvent => ({
      xuid: `21000000000200${String(index)}`,
      gamertag: `player-0-${String(index)}`,
      typeHint: 10,
      isMedal: false,
      eventType: "mode",
      timeMs,
      medalValue: 33554432,
      teamId: 0,
    });
    const spuriousEvents = [event(0, 0), event(10000, 1), event(10000, 2)];
    const progression = buildStrongholdsProgression(spuriousEvents, matchStats, 100000);
    expect(sampleScoreAt(progression.events, 0, 10000)).toBeLessThanOrEqual(2);
    const last = Preconditions.checkExists(progression.events.at(-1));
    expect(last.runningScores).toEqual({ "0": 90, "1": 0 });
  });

  it("returns no events when the match has no zone stats", () => {
    const base = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    const progression = buildStrongholdsProgression(strongholds2104Events(), base, STRONGHOLDS_2104_DURATION_MS);
    expect(progression.events).toEqual([]);
  });

  it("returns no events when the film has no mode events", () => {
    const matchStats = aFakeStrongholdsMatchStatsWith(
      new Map([
        [0, { score: 250, ticks: 237, captures: 23, secures: 7 }],
        [1, { score: 188, ticks: 185, captures: 21, secures: 3 }],
      ]),
    );
    const progression = buildStrongholdsProgression([], matchStats, STRONGHOLDS_2104_DURATION_MS);
    expect(progression.events).toEqual([]);
    expect(progression.teamCount).toBe(2);
  });
});
