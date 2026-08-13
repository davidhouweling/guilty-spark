import { describe, expect, it } from "vitest";
import { ComponentType } from "discord-api-types/v10";
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
    expect(response.components).toEqual([
      {
        type: ComponentType.ActionRow,
        components: [
          expect.objectContaining({ custom_id: "btn_leaderboard_first:guild-123:queue-123:1M:KILLS:2:3" }),
          expect.objectContaining({ custom_id: "btn_leaderboard_prev:guild-123:queue-123:1M:KILLS:2:3" }),
          expect.objectContaining({ custom_id: "btn_leaderboard_refresh:guild-123:queue-123:1M:KILLS:2:3" }),
          expect.objectContaining({ custom_id: "btn_leaderboard_next:guild-123:queue-123:1M:KILLS:2:3" }),
          expect.objectContaining({ custom_id: "btn_leaderboard_last:guild-123:queue-123:1M:KILLS:2:3" }),
        ],
      },
      expect.objectContaining({
        type: ComponentType.ActionRow,
        components: [
          expect.objectContaining({
            custom_id: "select_leaderboard_metric:guild-123:queue-123:1M:KILLS:2:3",
            options: expect.arrayContaining([expect.objectContaining({ value: LeaderboardMetric.Kills, default: true })]),
          }),
        ],
      }),
      expect.objectContaining({
        type: ComponentType.ActionRow,
        components: [
          expect.objectContaining({
            custom_id: "select_leaderboard_window:guild-123:queue-123:1M:KILLS:2:3",
            options: expect.arrayContaining([
              expect.objectContaining({ value: LeaderboardWindow.OneMonth, default: true }),
            ]),
          }),
        ],
      }),
    ]);
  });
});