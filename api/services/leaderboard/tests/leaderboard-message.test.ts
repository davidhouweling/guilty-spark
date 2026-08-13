import { describe, expect, it } from "vitest";
import type { APIMessage, APIMessageTopLevelComponent } from "discord-api-types/v10";
import { ComponentType } from "discord-api-types/v10";
import { LeaderboardMetric, LeaderboardWindow } from "@guilty-spark/shared/halo/leaderboard";
import { aFakeLeaderboardPostRow } from "../../database/fakes/database.fake";
import { fakeButtonClickInteraction } from "../../discord/fakes/data";
import { getLeaderboardMessageState } from "../leaderboard-message";

function aLeaderboardMessageWith({
  metric = LeaderboardMetric.Kills,
  window = LeaderboardWindow.ThreeMonths,
  footer = "Page 2 of 4 | Min games: 5 | Total players: 32",
}: {
  metric?: LeaderboardMetric;
  window?: LeaderboardWindow;
  footer?: string;
} = {}): APIMessage {
  const components: APIMessageTopLevelComponent[] = [
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: "select_leaderboard_metric:state",
          min_values: 1,
          max_values: 1,
          options: [{ label: "Kills", value: metric, default: true }],
        },
      ],
    },
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: "select_leaderboard_window:state",
          min_values: 1,
          max_values: 1,
          options: [{ label: "3 months", value: window, default: true }],
        },
      ],
    },
  ];

  return {
    ...fakeButtonClickInteraction.message,
    components,
    embeds: [
      {
        title: "Leaderboard - Server-wide (all queues)",
        footer: { text: footer },
      },
    ],
  };
}

describe("getLeaderboardMessageState", () => {
  it("derives filters and page state from leaderboard message controls and footer", () => {
    const post = aFakeLeaderboardPostRow({ GuildId: "guild-123", QueueChannelId: "queue-123" });
    const message = aLeaderboardMessageWith({
      metric: LeaderboardMetric.DamageRatio,
      window: LeaderboardWindow.SixMonths,
    });

    const state = getLeaderboardMessageState(message, post);

    expect(state).toEqual({
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.SixMonths,
      metric: LeaderboardMetric.DamageRatio,
      page: 2,
      minGamesPlayed: 5,
    });
  });

  it("returns null when leaderboard footer metadata is malformed", () => {
    const state = getLeaderboardMessageState(
      aLeaderboardMessageWith({ footer: "Leaderboard pagination unavailable" }),
      aFakeLeaderboardPostRow(),
    );

    expect(state).toBeNull();
  });

  it("derives pagination state from legacy embed description metadata", () => {
    const state = getLeaderboardMessageState(
      aLeaderboardMessageWith({
        footer: "",
      }),
      aFakeLeaderboardPostRow({ GuildId: "guild-123", QueueChannelId: "queue-123" }),
    );

    expect(state).toBeNull();

    const messageWithLegacyDescription = {
      ...aLeaderboardMessageWith(),
      embeds: [
        {
          title: "Leaderboard - Server-wide (all queues)",
          description: "Metric: Kills | Window: 3 months | Page 4 of 6 | Min games: 7 | Total players: 88",
        },
      ],
    };

    const legacyState = getLeaderboardMessageState(
      messageWithLegacyDescription,
      aFakeLeaderboardPostRow({ GuildId: "guild-123", QueueChannelId: "queue-123" }),
    );

    expect(legacyState).toEqual({
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.ThreeMonths,
      metric: LeaderboardMetric.Kills,
      page: 4,
      minGamesPlayed: 7,
    });
  });

  it("derives pagination state from legacy summary metadata format", () => {
    const messageWithLegacySummary = {
      ...aLeaderboardMessageWith(),
      embeds: [
        {
          title: "Leaderboard - Server-wide (all queues)",
          description: "Metric: Kills | Window: 3 months | Page: 5 | Min games: 9 | Total players: 52",
        },
      ],
    };

    const state = getLeaderboardMessageState(
      messageWithLegacySummary,
      aFakeLeaderboardPostRow({ GuildId: "guild-123", QueueChannelId: "queue-123" }),
    );

    expect(state).toEqual({
      guildId: "guild-123",
      queueChannelId: "queue-123",
      window: LeaderboardWindow.ThreeMonths,
      metric: LeaderboardMetric.Kills,
      page: 5,
      minGamesPlayed: 9,
    });
  });
});
