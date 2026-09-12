import { describe, expect, it } from "vitest";
import { GameVariantCategory } from "halo-infinite-api";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getMatchStats } from "../../../fakes/data";
import { buildStrongholdsProgression } from "../strongholds-progression";
import type { StrongholdsProgression, StrongholdsScorePoint } from "../strongholds-progression";
import { strongholds2104Events, STRONGHOLDS_2104_DURATION_MS } from "../fakes/strongholds-match-2104.fake";

interface TeamOverride {
  score: number;
  ticks: number;
  captures: number;
  secures: number;
}

function aStrongholdsMatchStatsWith(overridesByTeamId: Map<number, TeamOverride>): MatchStats {
  const base = Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth"));
  const match = structuredClone(base);
  match.MatchInfo.GameVariantCategory = GameVariantCategory.MultiplayerStrongholds;
  match.Teams = match.Teams.map((team) => {
    const override = Preconditions.checkExists(overridesByTeamId.get(team.TeamId));
    if (!("ZonesStats" in team.Stats)) {
      throw new Error("expected zones stats on the koth fixture");
    }
    return {
      ...team,
      Stats: {
        ...team.Stats,
        CoreStats: { ...team.Stats.CoreStats, Score: override.score },
        ZonesStats: {
          ...team.Stats.ZonesStats,
          StrongholdCaptures: override.captures,
          StrongholdSecures: override.secures,
          StrongholdScoringTicks: override.ticks,
        },
      },
    };
  });
  return match;
}

// Theatre-verified match 2104a978 (Eagle=team 0 250 : Cobra=team 1 188).
function build2104(): StrongholdsProgression {
  const matchStats = aStrongholdsMatchStatsWith(
    new Map([
      [0, { score: 250, ticks: 237, captures: 23, secures: 7 }],
      [1, { score: 188, ticks: 185, captures: 21, secures: 3 }],
    ]),
  );
  return buildStrongholdsProgression(strongholds2104Events(), matchStats, STRONGHOLDS_2104_DURATION_MS);
}

// Scoring accrues continuously, so the curve is a ramp between emitted points — sample it
// with linear interpolation.
function scoreAt(points: readonly StrongholdsScorePoint[], teamId: number, timestampMs: number): number {
  const key = String(teamId);
  let previous = { timestampMs: 0, value: 0 };
  for (const point of points) {
    const value = point.runningScores[key] ?? 0;
    if (point.timestampMs >= timestampMs) {
      const span = point.timestampMs - previous.timestampMs;
      if (span === 0) {
        return value;
      }
      return previous.value + ((value - previous.value) * (timestampMs - previous.timestampMs)) / span;
    }
    previous = { timestampMs: point.timestampMs, value };
  }
  return previous.value;
}

// In-game seconds -> Eagle:Cobra points read from the theatre HUD.
const THEATRE_WAYPOINTS: readonly (readonly [number, number, number])[] = [
  [42, 3, 0],
  [72, 6, 15],
  [113, 6, 45],
  [185, 66, 45],
  [233, 67, 63],
  [274, 67, 104],
  [314, 80, 112],
  [350, 80, 136],
  [392, 103, 137],
  [427, 114, 147],
  [466, 150, 147],
  [494, 153, 157],
  [527, 176, 157],
  [548, 189, 157],
  [577, 202, 157],
  [597, 211, 157],
  [616, 211, 176],
  [648, 213, 186],
  [664, 219, 188],
  [683, 250, 188],
];

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
    const errors = THEATRE_WAYPOINTS.map(([seconds, eagle, cobra]) => {
      const errorEagle = Math.abs(scoreAt(progression.events, 0, seconds * 1000) - eagle);
      const errorCobra = Math.abs(scoreAt(progression.events, 1, seconds * 1000) - cobra);
      totalError += errorEagle + errorCobra;
      return [seconds, errorEagle, errorCobra];
    });
    const meanError = totalError / (THEATRE_WAYPOINTS.length * 2);
    expect(meanError, JSON.stringify(errors)).toBeLessThanOrEqual(3);
  });

  it("stays within 8 points of the theatre reading at every waypoint", () => {
    expect.assertions(THEATRE_WAYPOINTS.length * 2);
    const progression = build2104();
    for (const [seconds, eagle, cobra] of THEATRE_WAYPOINTS) {
      expect(Math.abs(scoreAt(progression.events, 0, seconds * 1000) - eagle)).toBeLessThanOrEqual(8);
      expect(Math.abs(scoreAt(progression.events, 1, seconds * 1000) - cobra)).toBeLessThanOrEqual(8);
    }
  });

  it("returns no events when the match has no zone stats", () => {
    const base = Preconditions.checkExists(getMatchStats("9535b946-f30c-4a43-b852-000000slayer"));
    const progression = buildStrongholdsProgression(strongholds2104Events(), base, STRONGHOLDS_2104_DURATION_MS);
    expect(progression.events).toEqual([]);
  });

  it("returns no events when the film has no mode events", () => {
    const matchStats = aStrongholdsMatchStatsWith(
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
