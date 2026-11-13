import { describe, expect, it } from "vitest";
import type { PlaylistCsrContainer } from "halo-infinite-api";
import { aFakePreparedMatchHistoryEntryWith as aFakeMatchHistoryEntryWith } from "../../../services/individual-tracker/fakes/condensed-match-history.fake";
import { computeSearchStatsHighlights } from "../compute-search-highlights";

describe("computeSearchStatsHighlights", () => {
  it("computes win/loss and kda highlights from the loaded entries only", () => {
    const entries = [
      aFakeMatchHistoryEntryWith({
        matchId: "m-1",
        outcome: "Win",
      }),
      aFakeMatchHistoryEntryWith({
        matchId: "m-2",
        outcome: "Loss",
        highlightContribution: {
          kills: 6,
          deaths: 9,
          assists: 4,
          damageDealt: 4200,
          damageTaken: 3900,
          headshotKills: 5,
          shotsFired: 100,
          shotsHit: 50,
          totalLifeSeconds: 240,
          totalSpawns: 8,
          totalLifeSpawns: 8,
        },
      }),
    ];

    const items = computeSearchStatsHighlights(entries, ["matches-win-loss", "kills"], undefined, undefined);

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

    const items = computeSearchStatsHighlights([], ["current-rank"], csrContainer, {
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
