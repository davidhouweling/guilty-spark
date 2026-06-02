import { describe, expect, it } from "vitest";
import { GameVariantCategory } from "halo-infinite-api";
import { aFakeMatchStatsWith, aFakeTeamWith, aFakeCoreStatsWith } from "../fakes/data";
import { buildMatchScore, getMatchOutcomeLabel } from "../match-enrichment";

describe("getMatchOutcomeLabel()", () => {
  it.each([
    [1, "Tie"],
    [2, "Win"],
    [3, "Loss"],
    [4, "DNF"],
    [null, "Unknown"],
    [99, "Unknown"],
  ])("returns %s for outcome code %s", (outcomeCode, expected) => {
    expect(getMatchOutcomeLabel(outcomeCode)).toBe(expected);
  });
});

describe("buildMatchScore()", () => {
  const aFakePvpStats = (): { Kills: number; Deaths: number; Assists: number; KDA: number } => ({
    Kills: 0,
    Deaths: 0,
    Assists: 0,
    KDA: 0,
  });

  it("returns the bare team scores for a normal mode", () => {
    const matchStats = aFakeMatchStatsWith({
      MatchInfo: { ...aFakeMatchStatsWith().MatchInfo, GameVariantCategory: GameVariantCategory.MultiplayerSlayer },
      Teams: [
        aFakeTeamWith({
          TeamId: 0,
          Stats: { CoreStats: aFakeCoreStatsWith({ Score: 50 }), PvpStats: aFakePvpStats() },
        }),
        aFakeTeamWith({
          TeamId: 1,
          Stats: { CoreStats: aFakeCoreStatsWith({ Score: 42 }), PvpStats: aFakePvpStats() },
        }),
      ],
    });

    expect(buildMatchScore(matchStats)).toBe("50:42");
  });

  it("includes rounds won and score for Oddball", () => {
    const matchStats = aFakeMatchStatsWith({
      MatchInfo: { ...aFakeMatchStatsWith().MatchInfo, GameVariantCategory: GameVariantCategory.MultiplayerOddball },
      Teams: [
        aFakeTeamWith({
          TeamId: 0,
          Stats: { CoreStats: aFakeCoreStatsWith({ Score: 50, RoundsWon: 3 }), PvpStats: aFakePvpStats() },
        }),
        aFakeTeamWith({
          TeamId: 1,
          Stats: { CoreStats: aFakeCoreStatsWith({ Score: 42, RoundsWon: 2 }), PvpStats: aFakePvpStats() },
        }),
      ],
    });

    expect(buildMatchScore(matchStats)).toBe("3:2 (50:42)");
  });
});
