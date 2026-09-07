import { describe, expect, it } from "vitest";
import { ButtonStyle, ComponentType } from "discord-api-types/v10";
import type { APIMessage } from "discord-api-types/v10";
import {
  LeaderboardMetric,
  LeaderboardMetricAggregation,
  LeaderboardWindow,
} from "@guilty-spark/shared/halo/leaderboard";
import { LeaderboardPlayerRelationshipMetric } from "@guilty-spark/shared/halo/leaderboard-formatting";
import {
  PLAYER_STATS_QUEUE_SELECT_CONTROL_ID,
  PLAYER_STATS_WINDOW_SELECT_CONTROL_ID,
  PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID,
  createPlayerStatsEmbeds,
  createPlayerStatsRelationshipEmbeds,
  getWebPlayerStatsUrl,
  getPlayerStatsStateFromMessage,
} from "../player-stats-embed";
import {
  aFakeLeaderboardPlayerRelationshipRow,
  aFakeLeaderboardPlayerStatsRow,
} from "../../../services/database/fakes/database.fake";

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
        gamertag: "target-player",
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
        gamertag: "target-player",
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
  it("renders all avg-per-game metrics, including team objective contribution, without throwing", () => {
    const stats = aFakeLeaderboardPlayerStatsRow({ ObjectiveTeamContribution: 0.42 });

    const response = createPlayerStatsEmbeds({
      stats,
      ranks: new Map(),
      state: {
        aggregation: LeaderboardMetricAggregation.AvgPerGame,
        relationshipMetric: null,
        gamertag: "player-1",
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

  it("shows team objective contribution's own games-played population, not the overall objective games count", () => {
    const stats = aFakeLeaderboardPlayerStatsRow({
      ObjectiveGamesPlayed: 30,
      ObjectiveTeamContribution: 0.25,
      ObjectiveTeamContributionGamesPlayed: 18,
    });

    const response = createPlayerStatsEmbeds({
      stats,
      ranks: new Map(),
      state: {
        aggregation: LeaderboardMetricAggregation.AvgPerGame,
        relationshipMetric: null,
        gamertag: "player-1",
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
  });

  it.each([
    ["ObjectiveTime", LeaderboardMetric.ObjectiveTime, LeaderboardMetricAggregation.Total],
    ["AvgObjectiveTimePerGame", LeaderboardMetric.AvgObjectiveTimePerGame, LeaderboardMetricAggregation.AvgPerGame],
    ["ObjectiveTeamContribution", LeaderboardMetric.ObjectiveTeamContribution, LeaderboardMetricAggregation.AvgPerGame],
  ] as const)(
    "shows the metric-specific rank population suffix for %s when it differs from the overall total",
    (_name, metric, aggregation) => {
      const stats = aFakeLeaderboardPlayerStatsRow({});
      const ranks = new Map([
        [LeaderboardMetric.GamesPlayed, { rank: 3, total: 100 }],
        [metric, { rank: 5, total: 12 }],
      ]);

      const response = createPlayerStatsEmbeds({
        stats,
        ranks,
        state: {
          aggregation,
          relationshipMetric: null,
          gamertag: "player-1",
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
      expect(rowValues.join("\n")).toContain("#5 / 12");
    },
  );

  it("omits the metric-specific rank population suffix when overall population is unknown", () => {
    const stats = aFakeLeaderboardPlayerStatsRow({});
    const ranks = new Map([[LeaderboardMetric.ObjectiveTime, { rank: 5, total: 12 }]]);

    const response = createPlayerStatsEmbeds({
      stats,
      ranks,
      state: {
        aggregation: LeaderboardMetricAggregation.Total,
        relationshipMetric: null,
        gamertag: "player-1",
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
    expect(rowValues.join("\n")).toContain("#5");
    expect(rowValues.join("\n")).not.toContain("#5 / 12");
  });

  it("omits url from embed and adds a View player stats link button when pagesUrl is provided", () => {
    const stats = aFakeLeaderboardPlayerStatsRow({ Gamertag: "Master Chief" });

    const response = createPlayerStatsEmbeds({
      stats,
      ranks: new Map(),
      state: {
        aggregation: LeaderboardMetricAggregation.Total,
        relationshipMetric: null,
        gamertag: "Master Chief",
        queueChannelId: "queue-123",
        window: LeaderboardWindow.ThreeMonths,
      },
      locale: "en-US",
      guildId: "guild-123",
      queueLabel: "Queue queue-123",
      queueOptions: [],
      resetAt: null,
      minGamesPlayed: 1,
      pagesUrl: "https://pages.example/",
    });

    expect(response.embeds[0]?.url).toBeUndefined();

    const linkRow = response.components.find(
      (row) =>
        row.type === ComponentType.ActionRow &&
        row.components.some((c) => c.type === ComponentType.Button && c.style === ButtonStyle.Link),
    );
    expect(linkRow).toBeDefined();
    if (linkRow?.type === ComponentType.ActionRow && linkRow.components[0]?.type === ComponentType.Button) {
      expect(linkRow.components[0]).toMatchObject({
        style: ButtonStyle.Link,
        label: "View player stats",
        url: "https://pages.example/stats/player/Master%20Chief?guildId=guild-123&queueChannelId=queue-123",
      });
    }
  });
});

describe("getWebPlayerStatsUrl()", () => {
  it("constructs a normalized player stats web URL with query params", () => {
    const url = getWebPlayerStatsUrl("https://pages.example/", "Master Chief", "guild-123", "queue-456");
    expect(url).toBe("https://pages.example/stats/player/Master%20Chief?guildId=guild-123&queueChannelId=queue-456");
  });
});

describe("getPlayerStatsStateFromMessage()", () => {
  it("parses gamertag from message components containing a link button", () => {
    const message = {
      embeds: [
        {
          title: "Master Chief - Total",
          description: "Leaderboard stats for 3M (All queues)",
        },
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID,
              options: [{ label: "Total", value: "TOTAL", default: true }],
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: PLAYER_STATS_WINDOW_SELECT_CONTROL_ID,
              options: [{ label: "3 months", value: "3M", default: true }],
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Link,
              label: "View player stats",
              url: "https://pages.example/stats/player/Master%20Chief?guildId=guild-123",
            },
          ],
        },
      ],
    } as unknown as APIMessage;

    const state = getPlayerStatsStateFromMessage(message);
    expect(state).toEqual({
      gamertag: "Master Chief",
      queueChannelId: null,
      window: LeaderboardWindow.ThreeMonths,
      aggregation: LeaderboardMetricAggregation.Total,
      relationshipMetric: null,
    });
  });

  it("parses gamertag from embed title when link button is absent", () => {
    const message = {
      embeds: [
        {
          title: "soundmanD - Total",
          description: "Leaderboard stats for 1M (All queues)",
        },
      ],
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: PLAYER_STATS_AGGREGATION_SELECT_CONTROL_ID,
              options: [{ label: "Total", value: "TOTAL", default: true }],
            },
          ],
        },
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.StringSelect,
              custom_id: PLAYER_STATS_WINDOW_SELECT_CONTROL_ID,
              options: [{ label: "1 month", value: "1M", default: true }],
            },
          ],
        },
      ],
    } as unknown as APIMessage;

    const state = getPlayerStatsStateFromMessage(message);
    expect(state).toEqual({
      gamertag: "soundmanD",
      queueChannelId: null,
      window: LeaderboardWindow.OneMonth,
      aggregation: LeaderboardMetricAggregation.Total,
      relationshipMetric: null,
    });
  });
});
