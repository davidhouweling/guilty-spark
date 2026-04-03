import { describe, it, expect } from "vitest";
import type { MatchStats, Stats } from "halo-infinite-api";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { mergeCoreStats, adjustAveragesInCoreStats } from "@guilty-spark/shared/halo/series-core-stats";
import { aggregateTeamMedals } from "@guilty-spark/shared/halo/medals";
import { getPlayerXuid, getTeamPlayersFromMatches } from "@guilty-spark/shared/halo/match-utils";
import { BaseSeriesStatsPresenter } from "../base-series-stats-presenter";
import type { MatchStatsPlayerData } from "../types";
import { aFakeCoreStatsWith, aFakeMatchStatsWith, aFakePlayerWith, aFakeTeamWith } from "../fakes/data";

class TestSeriesStatsPresenter extends BaseSeriesStatsPresenter {
  public testMergeCoreStats(existing: Stats["CoreStats"], incoming: Stats["CoreStats"]): Stats["CoreStats"] {
    return mergeCoreStats(existing, incoming);
  }

  public testAdjustAveragesInCoreStats(coreStats: Stats["CoreStats"], matches: number): Stats["CoreStats"] {
    return adjustAveragesInCoreStats(coreStats, matches);
  }

  public testGetDurationInSeconds(duration: string): number {
    return getDurationInSeconds(duration);
  }

  public testGetTeamPlayersFromMatches(matches: MatchStats[], team: MatchStats["Teams"][0]): MatchStats["Players"] {
    return getTeamPlayersFromMatches(matches, team);
  }

  public testAggregatePlayerCoreStats(matches: MatchStats[]): Map<string, Stats["CoreStats"]> {
    return this.aggregatePlayerCoreStats(matches);
  }

  public testAggregateTeamMedals(
    players: MatchStatsPlayerData[],
  ): { name: string; count: number; sortingWeight: number }[] {
    return aggregateTeamMedals(players);
  }
}

describe("BaseSeriesStatsPresenter", () => {
  const presenter = new TestSeriesStatsPresenter();

  describe("mergeCoreStats", () => {
    it("merges numeric stats by summing", () => {
      const existing = aFakeCoreStatsWith({ Kills: 10, Deaths: 5 });
      const incoming = aFakeCoreStatsWith({ Kills: 15, Deaths: 8 });

      const result = presenter.testMergeCoreStats(existing, incoming);

      expect(result.Kills).toBe(25);
      expect(result.Deaths).toBe(13);
    });

    it("concatenates average life durations", () => {
      const existing = aFakeCoreStatsWith({ AverageLifeDuration: "PT30S" });
      const incoming = aFakeCoreStatsWith({ AverageLifeDuration: "PT45S" });

      const result = presenter.testMergeCoreStats(existing, incoming);

      expect(result.AverageLifeDuration).toBe("PT30S,PT45S");
    });

    it("merges medals by NameId", () => {
      const existing = aFakeCoreStatsWith({
        Medals: [
          { NameId: 100, Count: 2, TotalPersonalScoreAwarded: 50 },
          { NameId: 200, Count: 1, TotalPersonalScoreAwarded: 25 },
        ],
      });
      const incoming = aFakeCoreStatsWith({
        Medals: [
          { NameId: 100, Count: 3, TotalPersonalScoreAwarded: 75 },
          { NameId: 300, Count: 1, TotalPersonalScoreAwarded: 30 },
        ],
      });

      const result = presenter.testMergeCoreStats(existing, incoming);

      expect(result.Medals).toHaveLength(3);
      const medal100 = result.Medals.find((m) => m.NameId === 100);
      expect(medal100?.Count).toBe(5);
      expect(medal100?.TotalPersonalScoreAwarded).toBe(125);
    });

    it("merges PersonalScores by NameId", () => {
      const existing = aFakeCoreStatsWith({
        PersonalScores: [{ NameId: 1000, Count: 5, TotalPersonalScoreAwarded: 500 }],
      });
      const incoming = aFakeCoreStatsWith({
        PersonalScores: [{ NameId: 1000, Count: 3, TotalPersonalScoreAwarded: 300 }],
      });

      const result = presenter.testMergeCoreStats(existing, incoming);

      expect(result.PersonalScores).toHaveLength(1);
      expect(result.PersonalScores[0]?.Count).toBe(8);
      expect(result.PersonalScores[0]?.TotalPersonalScoreAwarded).toBe(800);
    });
  });

  describe("adjustAveragesInCoreStats", () => {
    it("averages accuracy across matches", () => {
      const coreStats = aFakeCoreStatsWith({ Accuracy: 150 });

      const result = presenter.testAdjustAveragesInCoreStats(coreStats, 3);

      expect(result.Accuracy).toBe(50);
    });

    it("averages life duration from concatenated values", () => {
      const coreStats = aFakeCoreStatsWith({ AverageLifeDuration: "PT30S,PT45S,PT60S" });

      const result = presenter.testAdjustAveragesInCoreStats(coreStats, 3);

      expect(result.AverageLifeDuration).toBe("PT45.0S");
    });

    it("handles single life duration", () => {
      const coreStats = aFakeCoreStatsWith({ AverageLifeDuration: "PT38.1S" });

      const result = presenter.testAdjustAveragesInCoreStats(coreStats, 1);

      expect(result.AverageLifeDuration).toBe("PT38.1S");
    });
  });

  describe("getDurationInSeconds", () => {
    it("converts ISO duration to seconds", () => {
      const result = presenter.testGetDurationInSeconds("PT1M30S");

      expect(result).toBe(90);
    });

    it("handles hours and minutes", () => {
      const result = presenter.testGetDurationInSeconds("PT1H5M30S");

      expect(result).toBe(3930);
    });

    it("handles fractional seconds", () => {
      const result = presenter.testGetDurationInSeconds("PT38.1S");

      expect(result).toBe(38.1);
    });
  });

  describe("getTeamPlayersFromMatches", () => {
    it("returns unique players from team across matches", () => {
      const match1 = aFakeMatchStatsWith({
        Teams: [aFakeTeamWith({ TeamId: 0 }), aFakeTeamWith({ TeamId: 1 })],
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111)",
            LastTeamId: 0,
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith(),
                  PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
                },
              },
            ],
          }),
          aFakePlayerWith({
            PlayerId: "xuid(2222)",
            LastTeamId: 1,
            PlayerTeamStats: [
              {
                TeamId: 1,
                Stats: {
                  CoreStats: aFakeCoreStatsWith(),
                  PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
                },
              },
            ],
          }),
        ],
      });
      const match2 = aFakeMatchStatsWith({
        Teams: [aFakeTeamWith({ TeamId: 0 }), aFakeTeamWith({ TeamId: 1 })],
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111)",
            LastTeamId: 0,
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith(),
                  PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
                },
              },
            ],
          }),
          aFakePlayerWith({
            PlayerId: "xuid(3333)",
            LastTeamId: 0,
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith(),
                  PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
                },
              },
            ],
          }),
        ],
      });

      const result = presenter.testGetTeamPlayersFromMatches([match1, match2], match1.Teams[0]);

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.PlayerId)).toContain("xuid(1111)");
      expect(result.map((p) => p.PlayerId)).toContain("xuid(3333)");
    });

    it("filters out players not present at beginning", () => {
      const match = aFakeMatchStatsWith({
        Teams: [aFakeTeamWith({ TeamId: 0 })],
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111)",
            LastTeamId: 0,
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith(),
                  PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
                },
              },
            ],
            ParticipationInfo: {
              FirstJoinedTime: "2024-11-26T11:05:39.587Z",
              LastLeaveTime: null,
              PresentAtBeginning: true,
              JoinedInProgress: false,
              LeftInProgress: false,
              PresentAtCompletion: true,
              TimePlayed: "PT8M34.25S",
              ConfirmedParticipation: null,
            },
          }),
          aFakePlayerWith({
            PlayerId: "xuid(2222)",
            LastTeamId: 0,
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith(),
                  PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
                },
              },
            ],
            ParticipationInfo: {
              FirstJoinedTime: "2024-11-26T11:05:39.587Z",
              LastLeaveTime: null,
              PresentAtBeginning: false,
              JoinedInProgress: true,
              LeftInProgress: false,
              PresentAtCompletion: true,
              TimePlayed: "PT8M34.25S",
              ConfirmedParticipation: null,
            },
          }),
        ],
      });

      const result = presenter.testGetTeamPlayersFromMatches([match], match.Teams[0]);

      expect(result).toHaveLength(1);
      expect(result[0]?.PlayerId).toBe("xuid(1111)");
    });
  });

  describe("aggregatePlayerCoreStats", () => {
    it("aggregates stats across multiple matches", () => {
      const match1 = aFakeMatchStatsWith({
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111)",
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith({ Kills: 10, Deaths: 5 }),
                  PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
                },
              },
            ],
          }),
        ],
      });
      const match2 = aFakeMatchStatsWith({
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111)",
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith({ Kills: 15, Deaths: 8 }),
                  PvpStats: { Kills: 15, Deaths: 8, Assists: 5, KDA: 2.5 },
                },
              },
            ],
          }),
        ],
      });

      const result = presenter.testAggregatePlayerCoreStats([match1, match2]);

      const playerStats = result.get("xuid(1111)");
      expect(playerStats?.Kills).toBe(25);
      expect(playerStats?.Deaths).toBe(13);
    });

    it("adjusts averages after aggregation", () => {
      const match1 = aFakeMatchStatsWith({
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111)",
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith({ Accuracy: 50 }),
                  PvpStats: { Kills: 10, Deaths: 5, Assists: 3, KDA: 2.6 },
                },
              },
            ],
          }),
        ],
      });
      const match2 = aFakeMatchStatsWith({
        Players: [
          aFakePlayerWith({
            PlayerId: "xuid(1111)",
            PlayerTeamStats: [
              {
                TeamId: 0,
                Stats: {
                  CoreStats: aFakeCoreStatsWith({ Accuracy: 60 }),
                  PvpStats: { Kills: 15, Deaths: 8, Assists: 5, KDA: 2.5 },
                },
              },
            ],
          }),
        ],
      });

      const result = presenter.testAggregatePlayerCoreStats([match1, match2]);

      const playerStats = result.get("xuid(1111)");
      expect(playerStats?.Accuracy).toBe(55);
    });
  });

  describe("getPlayerXuid", () => {
    it("extracts XUID from PlayerId", () => {
      const player = { PlayerId: "xuid(1234567890)" };

      const result = getPlayerXuid(player);

      expect(result).toBe("1234567890");
    });
  });

  describe("aggregateTeamMedals", () => {
    it("aggregates medals from all players", () => {
      const players = [
        {
          name: "Player1",
          values: [],
          medals: [
            { name: "Killing Spree", count: 2, sortingWeight: 100 },
            { name: "Double Kill", count: 3, sortingWeight: 50 },
          ],
        },
        {
          name: "Player2",
          values: [],
          medals: [
            { name: "Killing Spree", count: 1, sortingWeight: 100 },
            { name: "Triple Kill", count: 2, sortingWeight: 75 },
          ],
        },
      ];

      const result = presenter.testAggregateTeamMedals(players);

      expect(result).toHaveLength(3);
      const killingSpree = result.find((m) => m.name === "Killing Spree");
      expect(killingSpree?.count).toBe(3);
    });

    it("sorts medals by sorting weight descending", () => {
      const players = [
        {
          name: "Player1",
          values: [],
          medals: [
            { name: "Double Kill", count: 3, sortingWeight: 50 },
            { name: "Killing Spree", count: 2, sortingWeight: 100 },
            { name: "Triple Kill", count: 1, sortingWeight: 75 },
          ],
        },
      ];

      const result = presenter.testAggregateTeamMedals(players);

      expect(result[0]?.name).toBe("Killing Spree");
      expect(result[1]?.name).toBe("Triple Kill");
      expect(result[2]?.name).toBe("Double Kill");
    });
  });
});
