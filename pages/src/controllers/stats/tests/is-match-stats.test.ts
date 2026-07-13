import { describe, expect, it } from "vitest";
import { aFakeMatchStatsWith } from "../fakes/data";
import { isMatchStats } from "../is-match-stats";

describe("isMatchStats", () => {
  it("returns true for match stats-like values", () => {
    expect(isMatchStats(aFakeMatchStatsWith())).toBe(true);
  });

  it("returns false when required fields are missing or invalid", () => {
    expect(isMatchStats(null)).toBe(false);
    expect(isMatchStats({})).toBe(false);
    expect(
      isMatchStats({
        MatchId: "match-1",
        Teams: [],
        Players: [],
        MatchInfo: { StartTime: "2024-01-01T00:00:00Z", EndTime: 123 },
      }),
    ).toBe(false);
  });
});
