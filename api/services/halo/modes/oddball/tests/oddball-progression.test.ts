import type { MatchStats } from "halo-infinite-api";
import { describe, expect, it } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { getMatchStats } from "../../../fakes/data";
import { buildOddballProgression } from "../oddball-progression";
import { ODDBALL_3A8D_DURATION_MS, oddball3a8dEvents } from "../fakes/oddball-match-3a8d.fake";

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
