import { describe, expect, it } from "vitest";
import { computeAccumulated } from "../../../individual-tracker/mapper";

describe("computeAccumulated", () => {
  it("returns zeros for an empty match list", () => {
    expect(computeAccumulated([])).toEqual({ total: 0, wins: 0, losses: 0, ties: 0 });
  });

  it("counts wins, losses and ties correctly", () => {
    const matches = [{ outcome: "Win" }, { outcome: "Win" }, { outcome: "Loss" }, { outcome: "Tie" }];
    expect(computeAccumulated(matches)).toEqual({ total: 4, wins: 2, losses: 1, ties: 1 });
  });

  it("counts DNF and Unknown in total but not in wins/losses/ties", () => {
    const matches = [{ outcome: "Win" }, { outcome: "DNF" }, { outcome: "Unknown" }];
    expect(computeAccumulated(matches)).toEqual({ total: 3, wins: 1, losses: 0, ties: 0 });
  });

  it("handles a mix of all outcome types", () => {
    const matches = [
      { outcome: "Win" },
      { outcome: "Loss" },
      { outcome: "Tie" },
      { outcome: "DNF" },
      { outcome: "Unknown" },
    ];
    expect(computeAccumulated(matches)).toEqual({ total: 5, wins: 1, losses: 1, ties: 1 });
  });
});
