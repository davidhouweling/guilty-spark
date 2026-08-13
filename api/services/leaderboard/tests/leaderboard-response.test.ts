import { describe, expect, it } from "vitest";
import type { LeaderboardResponse } from "@guilty-spark/shared/contracts/stats/leaderboard";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { ComponentType } from "discord-api-types/v10";
import { EmbedColors } from "../../../embeds/colors";
import { createLeaderboardResponse } from "../leaderboard-response";

describe("createLeaderboardResponse", () => {
  it("creates the leaderboard embed and stateful controls", () => {
    const leaderboard: LeaderboardResponse = {
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.Kills,
      minGamesPlayed: 3,
      page: 2,
      pageSize: 10,
      total: 23,
      rows: [
        {
          rank: 11,
          xboxXuid: "xuid-1",
          discordUserId: "discord-1",
          gamertag: "Alpha",
          seriesPlayed: 3,
          seriesWins: 2,
          gamesPlayed: 9,
          metricValue: 44,
        },
      ],
    };

    const response = createLeaderboardResponse("en-US", leaderboard, "<t:1733483139:R>");

    expect(response.embeds).toEqual([
      {
        color: EmbedColors.GOLD,
        title: "Leaderboard - Queue <#queue-123>",
        description: "Metric: Kills | Window: 1 month\n-# Updated: <t:1733483139:R>",
        fields: [
          { name: "Rank", value: "#11", inline: true },
          { name: "Player", value: "<@discord-1> (Alpha)", inline: true },
          { name: "Kills", value: "44", inline: true },
        ],
        footer: { text: "Page 2 of 3 | Min games: 3 | Total players: 23" },
      },
    ]);
    expect(response.components).toHaveLength(4);
  });

  it("formats newly added metrics and includes them in metric select options", () => {
    const metricExpectations = [
      {
        metric: LeaderboardMetric.AvgLifeSeconds,
        expectedMetricLabel: "Avg life time",
        expectedMetricValue: "13.2s",
      },
      {
        metric: LeaderboardMetric.AvgDamagePerLife,
        expectedMetricLabel: "Avg damage per life",
        expectedMetricValue: "13.2",
      },
      {
        metric: LeaderboardMetric.HeadshotKills,
        expectedMetricLabel: "Headshot kills",
        expectedMetricValue: "13",
      },
      {
        metric: LeaderboardMetric.ShotsHit,
        expectedMetricLabel: "Shots hit",
        expectedMetricValue: "13",
      },
      {
        metric: LeaderboardMetric.ShotsFired,
        expectedMetricLabel: "Shots fired",
        expectedMetricValue: "13",
      },
    ] as const;

    for (const metricExpectation of metricExpectations) {
      const leaderboard: LeaderboardResponse = {
        guildId: "guild-123",
        queueChannelId: "queue-123",
        window: LeaderboardWindow.OneMonth,
        metric: metricExpectation.metric,
        minGamesPlayed: 3,
        page: 1,
        pageSize: 10,
        total: 1,
        rows: [
          {
            rank: 1,
            xboxXuid: "xuid-1",
            discordUserId: "discord-1",
            gamertag: "Alpha",
            seriesPlayed: 3,
            seriesWins: 2,
            gamesPlayed: 9,
            metricValue: 13.2,
          },
        ],
      };

      const response = createLeaderboardResponse("en-US", leaderboard, "<t:1733483139:R>");
      const fields = response.embeds?.[0]?.fields;
      expect(fields?.[2]).toEqual({
        name: metricExpectation.expectedMetricLabel,
        value: metricExpectation.expectedMetricValue,
        inline: true,
      });
    }

    const leaderboardForOptions: LeaderboardResponse = {
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.Kills,
      minGamesPlayed: 3,
      page: 1,
      pageSize: 10,
      total: 1,
      rows: [
        {
          rank: 1,
          xboxXuid: "xuid-1",
          discordUserId: "discord-1",
          gamertag: "Alpha",
          seriesPlayed: 3,
          seriesWins: 2,
          gamesPlayed: 9,
          metricValue: 44,
        },
      ],
    };

    const response = createLeaderboardResponse("en-US", leaderboardForOptions, "<t:1733483139:R>");
    const metricSelectRow = response.components?.[1];
    expect(metricSelectRow?.type).toBe(ComponentType.ActionRow);
    if (metricSelectRow?.type !== ComponentType.ActionRow) {
      throw new Error("Expected metric select row to be an action row");
    }

    const [metricSelect] = metricSelectRow.components;
    expect(metricSelect?.type).toBe(ComponentType.StringSelect);
    if (metricSelect?.type !== ComponentType.StringSelect) {
      throw new Error("Expected metric select control to be a string select");
    }

    const optionLabels = metricSelect.options.map((option) => option.label);
    expect(optionLabels).toContain("Headshot kills");
    expect(optionLabels).toContain("Shots hit");
    expect(optionLabels).toContain("Shots fired");
    expect(optionLabels).toContain("Avg life time");
    expect(optionLabels).toContain("Avg damage per life");
  });

  it("formats AvgDamagePerLife as infinity when metric value is Number.MAX_VALUE", () => {
    const leaderboard: LeaderboardResponse = {
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.AvgDamagePerLife,
      minGamesPlayed: 3,
      page: 1,
      pageSize: 10,
      total: 1,
      rows: [
        {
          rank: 1,
          xboxXuid: "xuid-1",
          discordUserId: "discord-1",
          gamertag: "Alpha",
          seriesPlayed: 3,
          seriesWins: 2,
          gamesPlayed: 9,
          metricValue: Number.MAX_VALUE,
        },
      ],
    };

    const response = createLeaderboardResponse("en-US", leaderboard, "<t:1733483139:R>");
    const fields = response.embeds?.[0]?.fields;
    expect(fields?.[2]).toEqual({
      name: "Avg damage per life",
      value: "∞",
      inline: true,
    });
  });
});
