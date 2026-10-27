import { describe, expect, it } from "vitest";
import { carryScoresForward, zeroScores } from "../score-samples";

describe("zeroScores", () => {
  it("seeds every team at zero", () => {
    expect(zeroScores([0, 1])).toEqual({ "0": 0, "1": 0 });
  });
});

describe("carryScoresForward", () => {
  it("moves only the teams a sample carries, keeping an explicit zero", () => {
    const cumulative: Record<string, number> = { "0": 3, "1": 2 };

    carryScoresForward(cumulative, { timestampMs: 1000, runningScores: { "1": 0 } }, ["0", "1"]);

    expect(cumulative).toEqual({ "0": 3, "1": 0 });
  });

  it("ignores teams outside the tracked keys", () => {
    const cumulative: Record<string, number> = {};

    carryScoresForward(cumulative, { timestampMs: 1000, runningScores: { "0": 1, "7": 9 } }, ["0", "1"]);

    expect(cumulative).toEqual({ "0": 1 });
  });
});
