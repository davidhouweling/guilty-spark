import { describe, expect, it } from "vitest";
import { LeaderboardMetric } from "../leaderboard";
import {
  LeaderboardPlayerRelationshipMetric,
  formatMetricValue,
  formatPerfects,
  formatRank,
  formatRelationshipValue,
  getPlayerStatMetricLabel,
  getPlayerStatsRelationshipMetricLabel,
  getRankText,
  getRelationshipFooter,
} from "../leaderboard-formatting";

describe("leaderboard-formatting", () => {
  describe("formatRank()", () => {
    it("returns medals for top 3 and #rank for others", () => {
      expect(formatRank(1)).toBe("🥇");
      expect(formatRank(2)).toBe("🥈");
      expect(formatRank(3)).toBe("🥉");
      expect(formatRank(4)).toBe("#4");
      expect(formatRank(10)).toBe("#10");
    });
  });

  describe("formatPerfects()", () => {
    it("uses singular and plural forms for perfect counts", () => {
      expect(formatPerfects(1)).toBe("1 perfect");
      expect(formatPerfects(2)).toBe("2 perfects");
      expect(formatPerfects(0)).toBe("0 perfects");
    });
  });

  describe("getRankText()", () => {
    it("returns Unranked when rank is null", () => {
      expect(getRankText(LeaderboardMetric.Kills, null, 10)).toBe("Unranked");
    });

    it("returns standard rank format for standard metrics", () => {
      expect(getRankText(LeaderboardMetric.Kills, { rank: 1, total: 10 }, 10)).toBe("🥇");
      expect(getRankText(LeaderboardMetric.Kills, { rank: 4, total: 10 }, 10)).toBe("#4");
    });

    it("includes population count when objective population differs from overall", () => {
      expect(getRankText(LeaderboardMetric.ObjectiveTime, { rank: 1, total: 5 }, 10)).toBe("🥇 / 5");
    });
  });

  describe("formatMetricValue()", () => {
    const context = {
      seriesWins: 8,
      seriesPlayed: 10,
      gameWins: 15,
      gamesPlayed: 20,
      objectiveGamesPlayed: 5,
    };

    it("formats win rates with percentages and ratios", () => {
      expect(formatMetricValue(0.8, LeaderboardMetric.SeriesWinRate, context)).toBe("80% (8/10)");
      expect(formatMetricValue(0.75, LeaderboardMetric.GamesWinRate, context)).toBe("75% (15/20)");
    });

    it("formats ratios and averages", () => {
      expect(formatMetricValue(1.75, LeaderboardMetric.Kda, context)).toBe("1.75");
      expect(formatMetricValue(50.4, LeaderboardMetric.Accuracy, context)).toBe("50.4%");
      expect(formatMetricValue(45.2, LeaderboardMetric.AvgLifeSeconds, context)).toBe("45.2s");
      expect(formatMetricValue(300, LeaderboardMetric.ObjectiveTime, context)).toBe("300s");
      expect(formatMetricValue(12.5, LeaderboardMetric.AvgKillsPerGame, context)).toBe("12.5 avg/game");
      expect(formatMetricValue(25.3, LeaderboardMetric.AvgKillsPerSeries, context)).toBe("25.3 avg/series");
    });

    it("formats integer totals", () => {
      expect(formatMetricValue(150, LeaderboardMetric.Kills, context)).toBe("150");
      expect(formatMetricValue(12000, LeaderboardMetric.PersonalScore, context)).toBe("12,000");
    });
  });

  describe("formatRelationshipValue()", () => {
    it("formats head to head kill and death metrics with perfects", () => {
      const row = {
        XboxXuid: "xuid-1",
        DiscordUserId: null,
        Gamertag: "Opponent",
        MetricValue: 8.5,
        SharedCount: 4,
        Wins: 3,
        Perfects: 2,
      };

      expect(formatRelationshipValue(row, LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills)).toBe(
        "8.5 kills/game (2 perfects)",
      );
      expect(formatRelationshipValue(row, LeaderboardPlayerRelationshipMetric.TotalHeadToHeadKills)).toBe(
        "8.5 kills (2 perfects)",
      );
    });

    it("formats win rates with shared counts", () => {
      const row = {
        XboxXuid: "xuid-1",
        DiscordUserId: null,
        Gamertag: "Teammate",
        MetricValue: 0.75,
        SharedCount: 4,
        Wins: 3,
        Perfects: 0,
      };

      expect(formatRelationshipValue(row, LeaderboardPlayerRelationshipMetric.SeriesWinRateWith)).toBe(
        "75% (3/4 shared series)",
      );
    });
  });

  describe("getPlayerStatsRelationshipMetricLabel() & getRelationshipFooter()", () => {
    it("returns descriptive labels", () => {
      expect(getPlayerStatsRelationshipMetricLabel(LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills)).toBe(
        "Avg head to head - Killed most",
      );
    });

    it("returns minimum thresholds when applicable", () => {
      expect(getRelationshipFooter(LeaderboardPlayerRelationshipMetric.SeriesWinRateWith)).toBe("Min shared series: 3");
      expect(getRelationshipFooter(LeaderboardPlayerRelationshipMetric.AvgHeadToHeadKills)).toBeUndefined();
    });
  });

  describe("getPlayerStatMetricLabel()", () => {
    it("returns distinct labels for metrics", () => {
      expect(getPlayerStatMetricLabel(LeaderboardMetric.SeriesWinRate)).toBe("Series win rate");
      expect(getPlayerStatMetricLabel(LeaderboardMetric.Kills)).toBe("Kills");
      expect(getPlayerStatMetricLabel(LeaderboardMetric.AvgKillsPerGame)).toBe("Avg kills / game");
    });
  });
});
