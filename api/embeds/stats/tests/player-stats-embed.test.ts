import { describe, expect, it } from "vitest";
import { ComponentType } from "discord-api-types/v10";
import { LeaderboardMetricAggregation, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import {
  PLAYER_STATS_QUEUE_SELECT_CONTROL_ID,
  createPlayerStatsEmbeds,
  createPlayerStatsRelationshipEmbeds,
} from "../player-stats-embed";
import {
  aFakeLeaderboardPlayerRelationshipRow,
  aFakeLeaderboardPlayerStatsRow,
} from "../../../services/database/fakes/database.fake";
import { LeaderboardPlayerRelationshipMetric } from "../../../services/database/types/leaderboard_player_relationship";

describe("createPlayerStatsRelationshipEmbeds()", () => {
  it("renders head-to-head rows with medals and perfect counts", () => {
    const response = createPlayerStatsRelationshipEmbeds({
      targetGamertag: "target-player",
      rows: [
        aFakeLeaderboardPlayerRelationshipRow({ Gamertag: "first-player", MetricValue: 12, Perfects: 2 }),
        aFakeLeaderboardPlayerRelationshipRow({ Gamertag: "second-player", MetricValue: 8, Perfects: 1 }),
        aFakeLeaderboardPlayerRelationshipRow({ Gamertag: "third-player", MetricValue: 7, Perfects: 0 }),
        aFakeLeaderboardPlayerRelationshipRow({ Gamertag: "fourth-player", MetricValue: 4, Perfects: 0 }),
      ],
      state: {
        aggregation: null,
        relationshipMetric: LeaderboardPlayerRelationshipMetric.TotalHeadToHeadKills,
        xboxXuid: "2533274000000001",
        queueChannelId: null,
        window: LeaderboardWindow.ThreeMonths,
      },
      locale: "en-US",
      queueLabel: "all configured queues",
      queueOptions: [],
      resetAt: null,
    });

    const [embed] = response.embeds;
    expect(embed?.title).toBe("target-player - Total head to head - Killed most");
    expect(embed?.fields).toEqual([
      { name: "Player", value: "first-player\nsecond-player\nthird-player\nfourth-player", inline: true },
      { name: "Rank", value: "🥇\n🥈\n🥉\n#4", inline: true },
      {
        name: "Value",
        value: "12 kills (2 perfects)\n8 kills (1 perfect)\n7 kills (0 perfects)\n4 kills (0 perfects)",
        inline: true,
      },
    ]);
    expect(embed?.footer).toBeUndefined();
  });

  it("renders win-rate eligibility context and no-data state", () => {
    const response = createPlayerStatsRelationshipEmbeds({
      targetGamertag: "target-player",
      rows: [],
      state: {
        aggregation: null,
        relationshipMetric: LeaderboardPlayerRelationshipMetric.GamesWinRateAgainst,
        xboxXuid: "2533274000000001",
        queueChannelId: "queue-1",
        window: LeaderboardWindow.OneMonth,
      },
      locale: "en-US",
      queueLabel: "Queue queue-1",
      queueOptions: [{ label: "Queue queue-1", value: "queue-1" }],
      resetAt: null,
    });

    const [embed] = response.embeds;
    expect(embed?.description).toBe("No relationship data found for 1M in the selected queue scope.");
    expect(embed?.fields).toEqual([]);
    expect(embed?.footer).toEqual({ text: "Min shared games: 5" });

    const queueSelectRow = response.components.find(
      (component) =>
        component.type === ComponentType.ActionRow &&
        component.components[0]?.type === ComponentType.StringSelect &&
        component.components[0].custom_id === PLAYER_STATS_QUEUE_SELECT_CONTROL_ID,
    );
    expect(queueSelectRow).toBeDefined();
  });
});

describe("createPlayerStatsEmbeds()", () => {
  it("renders all avg-per-game metrics, including objective game contribution, without throwing", () => {
    const stats = aFakeLeaderboardPlayerStatsRow({ ObjectiveGameContribution: 0.42 });

    const response = createPlayerStatsEmbeds({
      stats,
      ranks: new Map(),
      state: {
        aggregation: LeaderboardMetricAggregation.AvgPerGame,
        relationshipMetric: null,
        xboxXuid: "2533274000000001",
        queueChannelId: null,
        window: LeaderboardWindow.ThreeMonths,
      },
      locale: "en-US",
      queueLabel: "all configured queues",
      queueOptions: [],
      resetAt: null,
      minGamesPlayed: 1,
    });

    const rowValues = response.embeds.flatMap((embed) => embed.fields ?? []).flatMap((field) => field.value);
    expect(rowValues.join("\n")).toContain("42% avg/game");
  });

  it("shows each objective contribution metric's own games-played population, not the overall objective games count", () => {
    const stats = aFakeLeaderboardPlayerStatsRow({
      ObjectiveGamesPlayed: 30,
      ObjectiveTeamContribution: 0.25,
      ObjectiveTeamContributionGamesPlayed: 18,
      ObjectiveGameContribution: 0.42,
      ObjectiveGameContributionGamesPlayed: 12,
    });

    const response = createPlayerStatsEmbeds({
      stats,
      ranks: new Map(),
      state: {
        aggregation: LeaderboardMetricAggregation.AvgPerGame,
        relationshipMetric: null,
        xboxXuid: "2533274000000001",
        queueChannelId: null,
        window: LeaderboardWindow.ThreeMonths,
      },
      locale: "en-US",
      queueLabel: "all configured queues",
      queueOptions: [],
      resetAt: null,
      minGamesPlayed: 1,
    });

    const rowValues = response.embeds.flatMap((embed) => embed.fields ?? []).flatMap((field) => field.value);
    const combined = rowValues.join("\n");
    expect(combined).toContain("25% avg/game (18 games)");
    expect(combined).toContain("42% avg/game (12 games)");
  });
});
