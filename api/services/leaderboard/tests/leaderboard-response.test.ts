import { describe, expect, it } from "vitest";
import type { LeaderboardResponse } from "@guilty-spark/shared/contracts/stats/leaderboard";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { ComponentType } from "discord-api-types/v10";
import { EmbedColors } from "../../../embeds/colors";
import { createLeaderboardResponse } from "../leaderboard-response";

describe("createLeaderboardResponse", () => {
  it("formats total and average objective time with objective game context", () => {
    const baseLeaderboard: LeaderboardResponse = {
      guildId: "guild-123",
      queueChannelId: null,
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.ObjectiveTime,
      minGamesPlayed: 3,
      page: 1,
      pageSize: 10,
      total: 1,
      rows: [
        {
          rank: 1,
          xboxXuid: "xuid-1",
          discordUserId: null,
          gamertag: "Alpha",
          seriesPlayed: 3,
          seriesWins: 2,
          gamesPlayed: 12,
          gameWins: 6,
          medalCount: 0,
          objectiveGamesPlayed: 10,
          objectiveTimeSeconds: 426,
          metricValue: 426,
        },
      ],
    };

    const objectiveTimeResponse = createLeaderboardResponse("en-US", baseLeaderboard, "<t:1733483139:R>");
    expect(objectiveTimeResponse.embeds?.[0]?.fields?.[2]).toEqual({
      name: "Objective time",
      value: "7m 6s total (10 games)",
      inline: true,
    });

    const averageObjectiveTimeResponse = createLeaderboardResponse(
      "en-US",
      {
        ...baseLeaderboard,
        metric: LeaderboardMetric.AvgObjectiveTimePerGame,
        rows: baseLeaderboard.rows.map((row) => ({ ...row, metricValue: 42.6 })),
      },
      "<t:1733483139:R>",
    );
    expect(averageObjectiveTimeResponse.embeds?.[0]?.fields?.[2]).toEqual({
      name: "Avg objective time per game",
      value: "42s avg/game (7m 6s total, 10 games)",
      inline: true,
    });

    const teamContributionResponse = createLeaderboardResponse(
      "en-US",
      {
        ...baseLeaderboard,
        metric: LeaderboardMetric.ObjectiveTeamContribution,
        rows: baseLeaderboard.rows.map((row) => ({ ...row, metricValue: 0.314 })),
      },
      "<t:1733483139:R>",
    );
    expect(teamContributionResponse.embeds?.[0]?.fields?.[2]).toEqual({
      name: "Team objective contribution",
      value: "31.4% avg/game (10 games)",
      inline: true,
    });
  });

  it("formats medal points with the supporting medal count", () => {
    const leaderboard: LeaderboardResponse = {
      guildId: "guild-123",
      queueChannelId: null,
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.MedalPoints,
      minGamesPlayed: 3,
      page: 1,
      pageSize: 10,
      total: 1,
      rows: [
        {
          rank: 1,
          xboxXuid: "xuid-1",
          discordUserId: null,
          gamertag: "Alpha",
          seriesPlayed: 3,
          seriesWins: 2,
          gamesPlayed: 9,
          gameWins: 6,
          medalCount: 20,
          objectiveGamesPlayed: 0,
          objectiveTimeSeconds: 0,
          metricValue: 12450,
        },
      ],
    };

    const response = createLeaderboardResponse("en-US", leaderboard, "<t:1733483139:R>");

    expect(response.embeds?.[0]?.fields?.[2]).toEqual({
      name: "Medals by points",
      value: "12,450 points (20 medals)",
      inline: true,
    });
  });

  it("formats medal points and mythic medals with singular labels", () => {
    const medalPointsLeaderboard: LeaderboardResponse = {
      guildId: "guild-123",
      queueChannelId: null,
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.MedalPoints,
      minGamesPlayed: 3,
      page: 1,
      pageSize: 10,
      total: 1,
      rows: [
        {
          rank: 1,
          xboxXuid: "xuid-1",
          discordUserId: null,
          gamertag: "Alpha",
          seriesPlayed: 3,
          seriesWins: 2,
          gamesPlayed: 9,
          gameWins: 6,
          medalCount: 1,
          objectiveGamesPlayed: 0,
          objectiveTimeSeconds: 0,
          metricValue: 1,
        },
      ],
    };
    const mythicMedalsLeaderboard: LeaderboardResponse = {
      ...medalPointsLeaderboard,
      metric: LeaderboardMetric.MythicMedals,
    };

    const medalPointsResponse = createLeaderboardResponse("en-US", medalPointsLeaderboard, "<t:1733483139:R>");
    expect(medalPointsResponse.embeds?.[0]?.fields?.[2]).toEqual({
      name: "Medals by points",
      value: "1 point (1 medal)",
      inline: true,
    });

    const mythicMedalsResponse = createLeaderboardResponse("en-US", mythicMedalsLeaderboard, "<t:1733483139:R>");
    expect(mythicMedalsResponse.embeds?.[0]?.fields?.[2]).toEqual({
      name: "Mythic medals",
      value: "1 mythic medal",
      inline: true,
    });
  });

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
          gameWins: 6,
          medalCount: 12,
          objectiveGamesPlayed: 0,
          objectiveTimeSeconds: 0,
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
            gameWins: 6,
            medalCount: 12,
            objectiveGamesPlayed: 0,
            objectiveTimeSeconds: 0,
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
          gameWins: 6,
          medalCount: 12,
          objectiveGamesPlayed: 0,
          objectiveTimeSeconds: 0,
          metricValue: 44,
        },
      ],
    };

    const response = createLeaderboardResponse("en-US", leaderboardForOptions, "<t:1733483139:R>");
    const metricSelectRow = response.components?.[2];
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
    expect(optionLabels.slice(0, 6)).toEqual([
      "Series played",
      "Series wins",
      "Games played",
      "Game wins",
      "Personal score",
      "Kills",
    ]);
    expect(optionLabels).toContain("Headshot kills");
    expect(optionLabels).toContain("Shots hit");
    expect(optionLabels).toContain("Shots fired");
    expect(optionLabels).toContain("Medals by points");
    expect(optionLabels).toContain("Mythic medals");
    expect(optionLabels).not.toContain("Avg life time");
    expect(optionLabels).not.toContain("Avg damage per life");
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
          gameWins: 6,
          medalCount: 0,
          objectiveGamesPlayed: 0,
          objectiveTimeSeconds: 0,
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

  it("renders Avg per game aggregation for per-game-only metrics", () => {
    const leaderboard: LeaderboardResponse = {
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.Kda,
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
          gameWins: 6,
          medalCount: 0,
          objectiveGamesPlayed: 0,
          objectiveTimeSeconds: 0,
          metricValue: 1.44,
        },
      ],
    };

    const response = createLeaderboardResponse("en-US", leaderboard, "<t:1733483139:R>");
    expect(response.components).toHaveLength(4);
    const aggregationSelectRow = response.components?.[1];
    expect(aggregationSelectRow?.type).toBe(ComponentType.ActionRow);
    if (aggregationSelectRow?.type !== ComponentType.ActionRow) {
      throw new Error("Expected aggregation select row to be an action row");
    }
    const [aggregationSelect] = aggregationSelectRow.components;
    expect(aggregationSelect?.type).toBe(ComponentType.StringSelect);
    if (aggregationSelect?.type !== ComponentType.StringSelect) {
      throw new Error("Expected aggregation select control to be a string select");
    }
    expect(aggregationSelect.options.find((option) => option.default === true)?.label).toBe("Avg per game");

    const windowSelectRow = response.components?.[3];
    expect(windowSelectRow?.type).toBe(ComponentType.ActionRow);
    if (windowSelectRow?.type !== ComponentType.ActionRow) {
      throw new Error("Expected window select row to be an action row");
    }

    const [windowSelect] = windowSelectRow.components;
    expect(windowSelect?.type).toBe(ComponentType.StringSelect);
    if (windowSelect?.type !== ComponentType.StringSelect) {
      throw new Error("Expected window select control to be a string select");
    }
    expect(windowSelect.placeholder).toBe("Select window");
  });

  it("uses singular units for one objective", () => {
    const leaderboard: LeaderboardResponse = {
      guildId: "guild-123",
      queueChannelId: null,
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.FlagCaptures,
      minGamesPlayed: 0,
      page: 1,
      pageSize: 10,
      total: 1,
      rows: [
        {
          rank: 1,
          xboxXuid: "xuid-1",
          discordUserId: "discord-1",
          gamertag: "Alpha",
          seriesPlayed: 1,
          seriesWins: 1,
          gamesPlayed: 1,
          gameWins: 1,
          medalCount: 0,
          objectiveGamesPlayed: 1,
          objectiveTimeSeconds: 0,
          metricValue: 1,
        },
      ],
    };

    const response = createLeaderboardResponse("en-US", leaderboard, "<t:1733483139:R>");

    expect(response.embeds?.[0]?.fields?.[2]?.value).toContain("1 capture");
  });

  it("uses singular labels for average values of one", () => {
    const leaderboard: LeaderboardResponse = {
      guildId: "guild-123",
      queueChannelId: null,
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.AvgMedalPointsPerGame,
      minGamesPlayed: 0,
      page: 1,
      pageSize: 10,
      total: 1,
      rows: [
        {
          rank: 1,
          xboxXuid: "xuid-1",
          discordUserId: "discord-1",
          gamertag: "Alpha",
          seriesPlayed: 1,
          seriesWins: 1,
          gamesPlayed: 1,
          gameWins: 1,
          medalCount: 1,
          objectiveGamesPlayed: 0,
          objectiveTimeSeconds: 0,
          metricValue: 1,
        },
      ],
    };

    const response = createLeaderboardResponse("en-US", leaderboard, "<t:1733483139:R>");

    expect(response.embeds?.[0]?.fields?.[2]?.value).toContain("1 point");
  });

  it("prepends the reset window when a reset marker exists", () => {
    const leaderboard: LeaderboardResponse = {
      guildId: "guild-123",
      queueChannelId: null,
      window: LeaderboardWindow.LastReset,
      resetAt: 1_723_600_000,
      metric: LeaderboardMetric.Kills,
      minGamesPlayed: 3,
      page: 1,
      pageSize: 10,
      total: 0,
      rows: [],
    };

    const response = createLeaderboardResponse("en-US", leaderboard, "<t:1733483139:R>", false, "<t:1723600000:f>");
    expect(response.embeds?.[0]?.description).toContain("Window: Since <t:1723600000:f>");
    const windowSelectRow = response.components?.[3];
    if (windowSelectRow?.type !== ComponentType.ActionRow) {
      throw new Error("Expected window select row to be an action row");
    }
    const [windowSelect] = windowSelectRow.components;
    if (windowSelect?.type !== ComponentType.StringSelect) {
      throw new Error("Expected window select control to be a string select");
    }

    expect(windowSelect.options[0]).toMatchObject({
      label: "Last reset - 2024-08-14",
      value: LeaderboardWindow.LastReset,
      default: true,
    });
  });

  it("filters the family selector by the selected aggregation type", () => {
    const leaderboard: LeaderboardResponse = {
      guildId: "guild-123",
      queueChannelId: null,
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.AvgKillsPerSeries,
      minGamesPlayed: 3,
      page: 1,
      pageSize: 10,
      total: 0,
      rows: [],
    };

    const response = createLeaderboardResponse("en-US", leaderboard, "<t:1733483139:R>");
    const familySelectRow = response.components?.[2];
    if (familySelectRow?.type !== ComponentType.ActionRow) {
      throw new Error("Expected family select row to be an action row");
    }
    const [familySelect] = familySelectRow.components;
    if (familySelect?.type !== ComponentType.StringSelect) {
      throw new Error("Expected family select control to be a string select");
    }

    expect(familySelect.options.map((option) => option.label).slice(0, 3)).toEqual([
      "Win percentage",
      "Personal score",
      "Kills",
    ]);
    expect(familySelect.options.map((option) => option.label)).not.toContain("Games played");
  });

  it("omits components for a locked leaderboard", () => {
    const leaderboard: LeaderboardResponse = {
      guildId: "guild-123",
      queueChannelId: null,
      window: LeaderboardWindow.OneMonth,
      metric: LeaderboardMetric.Kills,
      minGamesPlayed: 3,
      page: 1,
      pageSize: 10,
      total: 0,
      rows: [],
    };

    const response = createLeaderboardResponse("en-US", leaderboard, "<t:1733483139:R>", true);

    expect(response.components).toBeUndefined();
  });
});
