import { describe, expect, it } from "vitest";
import type { PlaylistCsrContainer } from "halo-infinite-api";
import { aFakeCoreStatsWith, aFakeMatchStatsWith, aFakePlayerWith } from "../../halo/fakes/data";
import { accumulateMatchStatsForPlayer, computeStatsHighlightItems } from "../stats-highlights-compute";
import type { StatsHighlightMatchSummary } from "../stats-highlights-compute";

function aMatchSummaryWith(overrides: Partial<StatsHighlightMatchSummary>): StatsHighlightMatchSummary {
  return {
    matchId: "m1",
    isMatchmaking: true,
    teamRosterSignature: null,
    outcome: "Win",
    startTime: "2024-11-26T11:00:00.000Z",
    ...overrides,
  };
}

describe("computeStatsHighlightItems", () => {
  it("computes matches-win-loss, total-games, matchmaking-games and custom-local-games from the given matches", () => {
    const matches = [
      aMatchSummaryWith({ matchId: "m1", outcome: "Win", isMatchmaking: true }),
      aMatchSummaryWith({ matchId: "m2", outcome: "Loss", isMatchmaking: false }),
      aMatchSummaryWith({ matchId: "m3", outcome: "Tie", isMatchmaking: true }),
    ];

    const items = computeStatsHighlightItems({ matches, totals: undefined }, [
      "matches-win-loss",
      "total-games",
      "matchmaking-games",
      "custom-local-games",
    ]);

    expect(items).toEqual([
      { label: "Won:Loss", value: "1:1" },
      { label: "Total Games", value: "3" },
      { label: "Matchmaking Games", value: "2" },
      { label: "Custom/Local Games", value: "1" },
    ]);
  });

  it("computes series-win-loss by grouping matches with a shared roster signature", () => {
    const matches = [
      aMatchSummaryWith({
        matchId: "m1",
        startTime: "2024-11-26T11:00:00.000Z",
        outcome: "Win",
        isMatchmaking: false,
        teamRosterSignature: "0:1|1:2",
      }),
      aMatchSummaryWith({
        matchId: "m2",
        startTime: "2024-11-26T11:30:00.000Z",
        outcome: "Win",
        isMatchmaking: false,
        teamRosterSignature: "0:1|1:2",
      }),
    ];

    const items = computeStatsHighlightItems({ matches, totals: undefined }, ["series-win-loss"]);

    expect(items).toEqual([{ label: "Series Won:Loss", value: "1:0" }]);
  });

  it("formats accumulated totals for kills-deaths-assists-kda", () => {
    const items = computeStatsHighlightItems(
      {
        matches: [],
        totals: {
          kills: 20,
          deaths: 10,
          assists: 6,
          headshotKills: 8,
          shotsFired: 200,
          shotsHit: 100,
          damageDealt: 10000,
          damageTaken: 6000,
          totalLifeSeconds: 300,
          totalSpawns: 10,
          totalLifeSpawns: 10,
        },
      },
      ["kills-deaths-assists-kda"],
    );

    expect(items).toEqual([{ label: "Kills:Deaths:Assists (KDA)", value: "20:10:6 (2.2)" }]);
  });

  it("returns N/A for totals-based slots when no totals are provided", () => {
    const items = computeStatsHighlightItems({ matches: [], totals: undefined }, ["kills"]);

    expect(items).toEqual([{ label: "Kills", value: "N/A" }]);
  });

  it("returns a rankIcon alongside the formatted value for current-rank", () => {
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

    const items = computeStatsHighlightItems({ matches: [], totals: undefined }, ["current-rank"], csrContainer);

    expect(items).toEqual([
      {
        label: "Current Rank",
        value: "1,567",
        rankIcon: {
          rankTier: "Onyx",
          subTier: 0,
          measurementMatchesRemaining: 0,
          initialMeasurementMatches: 10,
        },
      },
    ]);
  });

  it("formats esra with a derived rankIcon", () => {
    const items = computeStatsHighlightItems({ matches: [], totals: undefined }, ["esra"], undefined, { esra: 1234.7 });

    expect(items).toEqual([
      {
        label: "ESRA",
        value: "1,235",
        rankIcon: {
          rankTier: "Diamond",
          subTier: 0,
          measurementMatchesRemaining: null,
          initialMeasurementMatches: null,
        },
      },
    ]);
  });
});

describe("accumulateMatchStatsForPlayer", () => {
  const trackedXuid = "1234567890";

  it("returns undefined when the player did not take part in the match", () => {
    const matchStats = aFakeMatchStatsWith({ Players: [aFakePlayerWith({ PlayerId: "xuid(9999999999)" })] });

    expect(accumulateMatchStatsForPlayer(undefined, matchStats, trackedXuid)).toBeUndefined();
  });

  it("accumulates core stats for the tracked player starting from no prior totals", () => {
    const matchStats = aFakeMatchStatsWith({
      Players: [
        aFakePlayerWith({
          PlayerId: `xuid(${trackedXuid})`,
          PlayerTeamStats: [
            {
              TeamId: 1,
              Stats: {
                CoreStats: aFakeCoreStatsWith({
                  Kills: 10,
                  Deaths: 5,
                  Assists: 3,
                  HeadshotKills: 4,
                  ShotsFired: 100,
                  ShotsHit: 52,
                  DamageDealt: 5000,
                  DamageTaken: 3000,
                  Spawns: 5,
                  AverageLifeDuration: "PT30S",
                }),
              },
            },
          ],
        }),
      ],
    });

    const totals = accumulateMatchStatsForPlayer(undefined, matchStats, trackedXuid);

    expect(totals).toEqual({
      kills: 10,
      deaths: 5,
      assists: 3,
      headshotKills: 4,
      shotsFired: 100,
      shotsHit: 52,
      damageDealt: 5000,
      damageTaken: 3000,
      totalLifeSeconds: 150,
      totalSpawns: 5,
      totalLifeSpawns: 5,
    });
  });

  it("adds onto existing totals across multiple matches", () => {
    const matchStats = aFakeMatchStatsWith({
      Players: [
        aFakePlayerWith({
          PlayerId: `xuid(${trackedXuid})`,
          PlayerTeamStats: [
            {
              TeamId: 1,
              Stats: {
                CoreStats: aFakeCoreStatsWith({ Kills: 5, Deaths: 2, Spawns: 3, AverageLifeDuration: "PT10S" }),
              },
            },
          ],
        }),
      ],
    });
    const priorTotals = {
      kills: 10,
      deaths: 5,
      assists: 3,
      headshotKills: 4,
      shotsFired: 100,
      shotsHit: 52,
      damageDealt: 5000,
      damageTaken: 3000,
      totalLifeSeconds: 150,
      totalSpawns: 5,
      totalLifeSpawns: 5,
    };

    const totals = accumulateMatchStatsForPlayer(priorTotals, matchStats, trackedXuid);

    expect(totals?.kills).toBe(15);
    expect(totals?.deaths).toBe(7);
    expect(totals?.totalSpawns).toBe(8);
    expect(totals?.totalLifeSeconds).toBe(180);
  });

  it("keeps totalSpawns but skips totalLifeSpawns for a malformed AverageLifeDuration", () => {
    const matchStats = aFakeMatchStatsWith({
      Players: [
        aFakePlayerWith({
          PlayerId: `xuid(${trackedXuid})`,
          PlayerTeamStats: [
            {
              TeamId: 1,
              Stats: { CoreStats: aFakeCoreStatsWith({ Spawns: 5, AverageLifeDuration: "NOT_VALID" }) },
            },
          ],
        }),
      ],
    });

    const totals = accumulateMatchStatsForPlayer(undefined, matchStats, trackedXuid);

    expect(totals?.totalSpawns).toBe(5);
    expect(totals?.totalLifeSpawns).toBe(0);
    expect(totals?.totalLifeSeconds).toBe(0);
  });
});
