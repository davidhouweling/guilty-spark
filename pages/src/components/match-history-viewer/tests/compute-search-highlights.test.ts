import { describe, expect, it } from "vitest";
import type { PlaylistCsrContainer } from "halo-infinite-api";
import { aFakeCoreStatsWith, aFakeMatchStatsWith, aFakePlayerWith } from "@guilty-spark/shared/halo/fakes/data";
import { aFakeMatchHistoryEntryWith } from "../../../services/individual-tracker/fakes/individual-tracker.fake";
import { computeSearchStatsHighlights } from "../compute-search-highlights";

const TRACKED_XUID = "1234567890";

describe("computeSearchStatsHighlights", () => {
  it("computes win/loss and kda highlights from the loaded entries only", () => {
    const entries = [
      aFakeMatchHistoryEntryWith({
        matchId: "m-1",
        outcome: "Win",
        rawMatchStats: aFakeMatchStatsWith({
          MatchId: "m-1",
          Players: [
            aFakePlayerWith({
              PlayerId: `xuid(${TRACKED_XUID})`,
              PlayerTeamStats: [{ TeamId: 0, Stats: { CoreStats: aFakeCoreStatsWith({ Kills: 10, Deaths: 5 }) } }],
            }),
          ],
        }),
      }),
      aFakeMatchHistoryEntryWith({
        matchId: "m-2",
        outcome: "Loss",
        rawMatchStats: aFakeMatchStatsWith({
          MatchId: "m-2",
          Players: [
            aFakePlayerWith({
              PlayerId: `xuid(${TRACKED_XUID})`,
              PlayerTeamStats: [{ TeamId: 0, Stats: { CoreStats: aFakeCoreStatsWith({ Kills: 6, Deaths: 9 }) } }],
            }),
          ],
        }),
      }),
    ];

    const items = computeSearchStatsHighlights(
      entries,
      TRACKED_XUID,
      ["matches-win-loss", "kills"],
      undefined,
      undefined,
    );

    expect(items).toEqual([
      { label: "Won:Loss", value: "1:1" },
      { label: "Kills", value: "16" },
    ]);
  });

  it("passes csr/esra straight through for rank-based slots regardless of loaded entries", () => {
    const fakeCsr = {
      Value: 1567,
      Tier: "Onyx",
      SubTier: 0,
      MeasurementMatchesRemaining: 0,
      TierStart: 1500,
      NextTier: "Onyx",
      NextTierStart: 1600,
      InitialMeasurementMatches: 10,
      DemotionProtectionMatchesRemaining: 0,
      InitialDemotionProtectionMatches: 5,
      NextSubTier: 0,
    };
    const csrContainer: PlaylistCsrContainer = {
      Current: fakeCsr,
      SeasonMax: { ...fakeCsr, Value: 0, Tier: "" },
      AllTimeMax: { ...fakeCsr, Value: 0, Tier: "" },
    };

    const items = computeSearchStatsHighlights([], TRACKED_XUID, ["current-rank"], csrContainer, {
      esra: null,
      lastRankedGamePlayed: null,
    });

    expect(items).toEqual([
      {
        label: "Current Rank",
        value: "1,567",
        rankIcon: { rankTier: "Onyx", subTier: 0, measurementMatchesRemaining: 0, initialMeasurementMatches: 10 },
      },
    ]);
  });
});
