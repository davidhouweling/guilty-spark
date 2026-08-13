import { describe, expect, it } from "vitest";
import type { LeaderboardResponse } from "@guilty-spark/shared/contracts/stats/leaderboard";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
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

    const response = createLeaderboardResponse("en-US", leaderboard);

    expect(response.embeds).toEqual([
      {
        color: EmbedColors.GOLD,
        title: "Leaderboard - Queue <#queue-123>",
        description: "Metric: Kills | Window: 1 month",
        fields: [
          { name: "Rank", value: "#11", inline: true },
          { name: "Player", value: "<@discord-1> (Alpha)", inline: true },
          { name: "Kills", value: "44", inline: true },
        ],
        footer: { text: "Page 2 of 3 | Min games: 3 | Total players: 23" },
      },
    ]);
    expect(response.components).toHaveLength(3);
  });
});
