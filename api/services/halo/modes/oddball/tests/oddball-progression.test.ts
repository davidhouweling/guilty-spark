import type { MatchStats } from "halo-infinite-api";
import { describe, expect, it } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getMatchStats } from "../../../fakes/data";
import { buildOddballProgression } from "../oddball-progression";
import { ODDBALL_3A8D_DURATION_MS, oddball3a8dEvents } from "../fakes/oddball-match-3a8d.fake";
import { ODDBALL_F206_DURATION_MS, oddballF206Events } from "../fakes/oddball-match-f206.fake";
import { ODDBALL_E0F9_DURATION_MS, oddballE0f9Events } from "../fakes/oddball-match-e0f9.fake";
import { ODDBALL_FF1A_DURATION_MS, oddballFf1aEvents } from "../fakes/oddball-match-ff1a.fake";

// The koth fixture carries two teams; only TeamId/Score/RoundsWon are read by the builder, so
// clone it into the oddball calibration match's shape.
function aCalibrationMatchStats(): MatchStats {
  const base = structuredClone(Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth")));
  const team0 = Preconditions.checkExists(base.Teams[0]);
  const team1 = Preconditions.checkExists(base.Teams[1]);
  team0.Stats.CoreStats.Score = 156;
  team0.Stats.CoreStats.RoundsWon = 1;
  team1.Stats.CoreStats.Score = 220;
  team1.Stats.CoreStats.RoundsWon = 2;
  return base;
}

function minute(m: number, s = 0): number {
  return (m * 60 + s) * 1000;
}

describe("buildOddballProgression (calibration match 3a8dab3d)", () => {
  const progression = buildOddballProgression(oddball3a8dEvents(), aCalibrationMatchStats(), ODDBALL_3A8D_DURATION_MS);

  it("detects three rounds with boundaries near the theatre-verified breaks", () => {
    expect(progression.rounds).toHaveLength(3);
    const [r1, r2, r3] = progression.rounds;
    expect(r1?.endMs).toBeGreaterThan(minute(7, 25));
    expect(r1?.endMs).toBeLessThan(minute(7, 36));
    expect(r2?.startMs).toBeGreaterThan(minute(7, 36));
    expect(r2?.endMs).toBeGreaterThan(minute(14, 20));
    expect(r2?.endMs).toBeLessThan(minute(14, 40));
    expect(r3?.startMs).toBeGreaterThan(minute(14, 40));
  });

  it("classifies round endings: time-out, cap, time-out", () => {
    expect(progression.rounds.map((r) => r.endedByCap)).toEqual([false, true, false]);
  });

  it("identifies round winners Eagle, Cobra, Cobra", () => {
    expect(progression.rounds.map((r) => r.winnerTeamId)).toEqual([0, 1, 1]);
  });

  it("reconciles per-team round scores to the API match totals", () => {
    const eagle = progression.rounds.reduce((acc, r) => acc + (r.scores["0"] ?? 0), 0);
    const cobra = progression.rounds.reduce((acc, r) => acc + (r.scores["1"] ?? 0), 0);
    expect(eagle).toBe(156);
    expect(cobra).toBe(220);
  });

  it("snaps the capped round's winner to exactly 100", () => {
    expect(progression.rounds[1]?.scores["1"]).toBe(100);
  });

  it("estimates round-end scores within tolerance of theatre truth", () => {
    const truth = [
      { eagle: 61, cobra: 47 },
      { eagle: 23, cobra: 100 },
      { eagle: 72, cobra: 73 },
    ];
    expect.assertions(6);
    for (const [index, round] of progression.rounds.entries()) {
      const expected = Preconditions.checkExists(truth[index]);
      expect(Math.abs((round.scores["0"] ?? 0) - expected.eagle)).toBeLessThanOrEqual(10);
      expect(Math.abs((round.scores["1"] ?? 0) - expected.cobra)).toBeLessThanOrEqual(10);
    }
  });

  it("tracks the round 3 curve within tolerance at theatre waypoints", () => {
    const r3 = Preconditions.checkExists(progression.rounds[2]);
    const waypoints = [
      { atMs: minute(16, 40), eagle: 24, cobra: 1 },
      { atMs: minute(18, 20), eagle: 63, cobra: 11 },
      { atMs: minute(20, 0), eagle: 63, cobra: 32 },
      { atMs: minute(21, 0), eagle: 69, cobra: 46 },
      { atMs: minute(22, 0), eagle: 70, cobra: 69 },
    ];
    const errors = waypoints.map(({ atMs, eagle, cobra }) => {
      const latest = [...r3.points].reverse().find((p) => p.timestampMs <= atMs);
      const estEagle = latest?.runningScores["0"] ?? 0;
      const estCobra = latest?.runningScores["1"] ?? 0;
      return Math.abs(estEagle - eagle) + Math.abs(estCobra - cobra);
    });
    const mae = errors.reduce((a, b) => a + b, 0) / (errors.length * 2);
    expect(mae).toBeLessThanOrEqual(8);
  });
});

describe("buildOddballProgression (blind-validated match f2061e40)", () => {
  function aF206MatchStats(): MatchStats {
    const base = structuredClone(Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth")));
    const team0 = Preconditions.checkExists(base.Teams[0]);
    const team1 = Preconditions.checkExists(base.Teams[1]);
    team0.Stats.CoreStats.Score = 140;
    team0.Stats.CoreStats.RoundsWon = 2;
    team1.Stats.CoreStats.Score = 95;
    team1.Stats.CoreStats.RoundsWon = 0;
    return base;
  }

  const progression = buildOddballProgression(oddballF206Events(), aF206MatchStats(), ODDBALL_F206_DURATION_MS);

  it("classifies both rounds as timed out with Eagle winning each", () => {
    expect(progression.rounds).toHaveLength(2);
    expect(progression.rounds.map((r) => r.endedByCap)).toEqual([false, false]);
    expect(progression.rounds.map((r) => r.winnerTeamId)).toEqual([0, 0]);
  });

  it("does not misread the buzzer-scramble touch at round 1's end as a cap", () => {
    // Eagle's final round-1 event lands within seconds of the round end, but it is a touch,
    // not a meter-riding crossing — the round timed out at 64:28.
    expect(progression.rounds[0]?.endedByCap).toBe(false);
  });

  it("estimates round-end scores within tolerance of theatre truth", () => {
    const truth = [
      { eagle: 64, cobra: 28 },
      { eagle: 76, cobra: 67 },
    ];
    expect.assertions(4);
    for (const [index, round] of progression.rounds.entries()) {
      const expected = Preconditions.checkExists(truth[index]);
      expect(Math.abs((round.scores["0"] ?? 0) - expected.eagle)).toBeLessThanOrEqual(12);
      expect(Math.abs((round.scores["1"] ?? 0) - expected.cobra)).toBeLessThanOrEqual(12);
    }
  });

  it("tracks minute-interval waypoints within tolerance", () => {
    const waypoints = [
      { round: 0, atMs: minute(4), eagle: 5, cobra: 16 },
      { round: 0, atMs: minute(5), eagle: 28, cobra: 16 },
      { round: 0, atMs: minute(6), eagle: 46, cobra: 17 },
      { round: 0, atMs: minute(7), eagle: 64, cobra: 17 },
      { round: 1, atMs: minute(9), eagle: 19, cobra: 1 },
      { round: 1, atMs: minute(10), eagle: 28, cobra: 11 },
      { round: 1, atMs: minute(11), eagle: 47, cobra: 13 },
      { round: 1, atMs: minute(12), eagle: 47, cobra: 24 },
      { round: 1, atMs: minute(13), eagle: 61, cobra: 33 },
      { round: 1, atMs: minute(14), eagle: 73, cobra: 41 },
      { round: 1, atMs: minute(15), eagle: 76, cobra: 67 },
    ];
    const errors = waypoints.map(({ round, atMs, eagle, cobra }) => {
      const { points } = Preconditions.checkExists(progression.rounds[round]);
      const latest = [...points].reverse().find((p) => p.timestampMs <= atMs);
      return Math.abs((latest?.runningScores["0"] ?? 0) - eagle) + Math.abs((latest?.runningScores["1"] ?? 0) - cobra);
    });
    const mae = errors.reduce((a, b) => a + b, 0) / (errors.length * 2);
    expect(mae).toBeLessThanOrEqual(8);
  });
});

describe("buildOddballProgression (blind-validated single-round series matches)", () => {
  function aSingleRoundMatchStats(eagleScore: number): MatchStats {
    const base = structuredClone(Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth")));
    const team0 = Preconditions.checkExists(base.Teams[0]);
    const team1 = Preconditions.checkExists(base.Teams[1]);
    team0.Stats.CoreStats.Score = eagleScore;
    team0.Stats.CoreStats.RoundsWon = 0;
    team1.Stats.CoreStats.Score = 100;
    team1.Stats.CoreStats.RoundsWon = 1;
    return base;
  }

  it("reconstructs e0f9e7c0: one capped round, Cobra 100 over Eagle 47", () => {
    const progression = buildOddballProgression(
      oddballE0f9Events(),
      aSingleRoundMatchStats(47),
      ODDBALL_E0F9_DURATION_MS,
    );
    expect(progression.rounds).toHaveLength(1);
    const round = Preconditions.checkExists(progression.rounds[0]);
    expect(round.endedByCap).toBe(true);
    expect(round.winnerTeamId).toBe(1);
    expect(round.scores).toEqual({ "0": 47, "1": 100 });
    const waypoints = [
      { atMs: minute(2), eagle: 0, cobra: 38 },
      { atMs: minute(3), eagle: 8, cobra: 42 },
      { atMs: minute(4), eagle: 10, cobra: 59 },
      { atMs: minute(5), eagle: 25, cobra: 59 },
      { atMs: minute(6), eagle: 41, cobra: 75 },
      { atMs: minute(7), eagle: 47, cobra: 95 },
    ];
    const errors = waypoints.map(({ atMs, eagle, cobra }) => {
      const latest = [...round.points].reverse().find((p) => p.timestampMs <= atMs);
      return Math.abs((latest?.runningScores["0"] ?? 0) - eagle) + Math.abs((latest?.runningScores["1"] ?? 0) - cobra);
    });
    expect(errors.reduce((a, b) => a + b, 0) / (errors.length * 2)).toBeLessThanOrEqual(8);
  });

  it("reconstructs ff1ab79d: one capped round, Cobra 100 over Eagle 71", () => {
    const progression = buildOddballProgression(
      oddballFf1aEvents(),
      aSingleRoundMatchStats(71),
      ODDBALL_FF1A_DURATION_MS,
    );
    expect(progression.rounds).toHaveLength(1);
    const round = Preconditions.checkExists(progression.rounds[0]);
    expect(round.endedByCap).toBe(true);
    expect(round.winnerTeamId).toBe(1);
    expect(round.scores).toEqual({ "0": 71, "1": 100 });
    const waypoints = [
      { atMs: minute(2), eagle: 4, cobra: 1 },
      { atMs: minute(3), eagle: 4, cobra: 25 },
      { atMs: minute(4), eagle: 34, cobra: 34 },
      { atMs: minute(5), eagle: 64, cobra: 38 },
      { atMs: minute(6), eagle: 64, cobra: 54 },
      { atMs: minute(7), eagle: 69, cobra: 63 },
    ];
    const errors = waypoints.map(({ atMs, eagle, cobra }) => {
      const latest = [...round.points].reverse().find((p) => p.timestampMs <= atMs);
      return Math.abs((latest?.runningScores["0"] ?? 0) - eagle) + Math.abs((latest?.runningScores["1"] ?? 0) - cobra);
    });
    expect(errors.reduce((a, b) => a + b, 0) / (errors.length * 2)).toBeLessThanOrEqual(5);
  });
});

describe("buildOddballProgression cap invariants", () => {
  function aF206StatsForInvariants(): MatchStats {
    const base = structuredClone(Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth")));
    const team0 = Preconditions.checkExists(base.Teams[0]);
    const team1 = Preconditions.checkExists(base.Teams[1]);
    team0.Stats.CoreStats.Score = 140;
    team0.Stats.CoreStats.RoundsWon = 2;
    team1.Stats.CoreStats.Score = 95;
    team1.Stats.CoreStats.RoundsWon = 0;
    return base;
  }
  function aSingleRoundStatsForInvariants(eagleScore: number): MatchStats {
    const base = structuredClone(Preconditions.checkExists(getMatchStats("e20900f9-4c6c-4003-a175-00000000koth")));
    const team0 = Preconditions.checkExists(base.Teams[0]);
    const team1 = Preconditions.checkExists(base.Teams[1]);
    team0.Stats.CoreStats.Score = eagleScore;
    team0.Stats.CoreStats.RoundsWon = 0;
    team1.Stats.CoreStats.Score = 100;
    team1.Stats.CoreStats.RoundsWon = 1;
    return base;
  }

  it("never emits a round score above the cap, and only cap winners reach it", () => {
    const progressions = [
      buildOddballProgression(oddball3a8dEvents(), aCalibrationMatchStats(), ODDBALL_3A8D_DURATION_MS),
      buildOddballProgression(oddballF206Events(), aF206StatsForInvariants(), ODDBALL_F206_DURATION_MS),
      buildOddballProgression(oddballE0f9Events(), aSingleRoundStatsForInvariants(47), ODDBALL_E0F9_DURATION_MS),
      buildOddballProgression(oddballFf1aEvents(), aSingleRoundStatsForInvariants(71), ODDBALL_FF1A_DURATION_MS),
    ];
    expect.assertions(progressions.reduce((acc, p) => acc + p.rounds.length * 2, 0));
    for (const progression of progressions) {
      for (const round of progression.rounds) {
        for (const [teamIdKey, score] of Object.entries(round.scores)) {
          const isCapWinner = round.endedByCap && String(round.winnerTeamId) === teamIdKey;
          expect(score).toBeLessThanOrEqual(isCapWinner ? 100 : 99);
        }
      }
    }
  });
});
