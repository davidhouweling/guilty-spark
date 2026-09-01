import { describe, expect, it } from "vitest";
import { ComponentType } from "discord-api-types/v10";
import {
  LeaderboardMetric,
  LeaderboardMetricAggregation,
  LeaderboardWindow,
} from "@guilty-spark/shared/halo/leaderboard";
import {
  PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID,
  createPlayerCompareEmbeds,
  createPlayerCompareLoadingResponse,
  createPlayerCompareNoQualifyingGamesResponse,
  getPlayerCompareStateFromMessage,
} from "../player-compare-embed";
import { aFakeLeaderboardPlayerStatsRow } from "../../../services/database/fakes/database.fake";
import { apiMessage } from "../../../services/discord/fakes/data";

describe("createPlayerCompareEmbeds()", () => {
  it("renders a stat/player1/player2 table with the target gamertags as column headers", () => {
    const stats1 = aFakeLeaderboardPlayerStatsRow({ XboxXuid: "xuid-1", Gamertag: "player-one", Kills: 600 });
    const stats2 = aFakeLeaderboardPlayerStatsRow({ XboxXuid: "xuid-2", Gamertag: "player-two", Kills: 450 });

    const response = createPlayerCompareEmbeds({
      stats1,
      stats2,
      ranks1: new Map(),
      ranks2: new Map(),
      state: {
        xboxXuid1: "xuid-1",
        xboxXuid2: "xuid-2",
        queueChannelId: null,
        window: LeaderboardWindow.ThreeMonths,
        aggregation: LeaderboardMetricAggregation.Total,
      },
      locale: "en-US",
      queueLabel: "all configured queues",
      queueOptions: [],
      resetAt: null,
    });

    const [embed] = response.embeds;
    expect(embed?.title).toBe("player-one vs player-two - Total");
    expect(embed?.url).toBe("https://guilty-spark.app/stats/compare/xuid-1/xuid-2");

    const [statField, player1Field, player2Field] = embed?.fields ?? [];
    expect(statField?.name).toBe("Stat");
    expect(player1Field?.name).toBe("player-one");
    expect(player2Field?.name).toBe("player-two");
    expect(player1Field?.value).toContain("600");
    expect(player2Field?.value).toContain("450");
  });

  it("shows each player's rank alongside their value in the same field", () => {
    const stats1 = aFakeLeaderboardPlayerStatsRow({ XboxXuid: "xuid-1", Gamertag: "player-one", Kills: 600 });
    const stats2 = aFakeLeaderboardPlayerStatsRow({ XboxXuid: "xuid-2", Gamertag: "player-two", Kills: 450 });

    const response = createPlayerCompareEmbeds({
      stats1,
      stats2,
      ranks1: new Map([[LeaderboardMetric.Kills, { rank: 1, total: 20 }]]),
      ranks2: new Map([[LeaderboardMetric.Kills, { rank: 4, total: 20 }]]),
      state: {
        xboxXuid1: "xuid-1",
        xboxXuid2: "xuid-2",
        queueChannelId: null,
        window: LeaderboardWindow.ThreeMonths,
        aggregation: LeaderboardMetricAggregation.Total,
      },
      locale: "en-US",
      queueLabel: "all configured queues",
      queueOptions: [],
      resetAt: null,
    });

    const [embed] = response.embeds;
    const [statField, player1Field, player2Field] = embed?.fields ?? [];
    const killsIndex = statField?.value.split("\n").indexOf("Kills");

    expect(player1Field?.value.split("\n")[killsIndex ?? -1]).toBe("🥇 | 600");
    expect(player2Field?.value.split("\n")[killsIndex ?? -1]).toBe("#4 | 450");
  });

  it("shows n/a for a player who has not played the objective category, keeping the row", () => {
    const stats1 = aFakeLeaderboardPlayerStatsRow({
      Gamertag: "player-one",
      CtfGamesPlayed: 8,
      FlagCaptures: 5,
    });
    const stats2 = aFakeLeaderboardPlayerStatsRow({
      Gamertag: "player-two",
      CtfGamesPlayed: 0,
      FlagCaptures: 0,
    });

    const response = createPlayerCompareEmbeds({
      stats1,
      stats2,
      ranks1: new Map(),
      ranks2: new Map(),
      state: {
        xboxXuid1: "xuid-1",
        xboxXuid2: "xuid-2",
        queueChannelId: null,
        window: LeaderboardWindow.ThreeMonths,
        aggregation: LeaderboardMetricAggregation.TotalObjective,
      },
      locale: "en-US",
      queueLabel: "all configured queues",
      queueOptions: [],
      resetAt: null,
    });

    const fields = response.embeds.flatMap((embed) => embed.fields ?? []);
    const statField = fields.find((field) => field.name === "Stat");
    const flagCapturesIndex = statField?.value.split("\n").findIndex((label) => label === "Flag - Captures");
    const player2Field = fields.find((field) => field.name === "player-two");

    expect(flagCapturesIndex).toBeGreaterThanOrEqual(0);
    expect(player2Field?.value.split("\n")[flagCapturesIndex ?? -1]).toBe("n/a");
  });
});

describe("createPlayerCompareLoadingResponse()", () => {
  it("disables the select controls and preserves the compare state url", () => {
    const response = createPlayerCompareLoadingResponse(
      {
        ...apiMessage,
        embeds: [
          { title: "player-one vs player-two - Total", url: "https://guilty-spark.app/stats/compare/xuid-1/xuid-2" },
        ],
        components: [
          {
            type: ComponentType.ActionRow,
            components: [
              {
                type: ComponentType.StringSelect,
                custom_id: PLAYER_COMPARE_QUEUE_SELECT_CONTROL_ID,
                options: [{ label: "All configured queues", value: "-", default: true }],
              },
            ],
          },
        ],
      },
      {
        xboxXuid1: "xuid-1",
        xboxXuid2: "xuid-2",
        queueChannelId: null,
        window: LeaderboardWindow.ThreeMonths,
        aggregation: LeaderboardMetricAggregation.Total,
      },
    );

    expect(response.embeds[0]?.description).toBe("Updating stats...");
    const [actionRow] = response.components;
    expect(actionRow?.type === ComponentType.ActionRow && actionRow.components[0]).toMatchObject({ disabled: true });
  });
});

describe("createPlayerCompareNoQualifyingGamesResponse()", () => {
  it("shows a no-games embed while preserving controls", () => {
    const response = createPlayerCompareNoQualifyingGamesResponse(
      { ...apiMessage, embeds: [], components: [] },
      {
        xboxXuid1: "xuid-1",
        xboxXuid2: "xuid-2",
        queueChannelId: null,
        window: LeaderboardWindow.OneMonth,
        aggregation: LeaderboardMetricAggregation.Total,
      },
    );

    expect(response.embeds[0]?.description).toBe(
      "No games played by one or both players in 1M for the selected queue scope.",
    );
  });
});

describe("getPlayerCompareStateFromMessage()", () => {
  it("returns null when the message has no components", () => {
    const { components, ...messageWithoutComponents } = apiMessage;
    void components;
    expect(getPlayerCompareStateFromMessage(messageWithoutComponents)).toBeNull();
  });

  it("parses both target xuids from the embed url and the selected aggregation/window", () => {
    const message = createPlayerCompareEmbeds({
      stats1: aFakeLeaderboardPlayerStatsRow({ XboxXuid: "xuid-1", Gamertag: "player-one" }),
      stats2: aFakeLeaderboardPlayerStatsRow({ XboxXuid: "xuid-2", Gamertag: "player-two" }),
      ranks1: new Map(),
      ranks2: new Map(),
      state: {
        xboxXuid1: "xuid-1",
        xboxXuid2: "xuid-2",
        queueChannelId: null,
        window: LeaderboardWindow.SixMonths,
        aggregation: LeaderboardMetricAggregation.AvgPerGame,
      },
      locale: "en-US",
      queueLabel: "all configured queues",
      queueOptions: [],
      resetAt: null,
    });

    const state = getPlayerCompareStateFromMessage({ ...apiMessage, ...message });
    expect(state).toEqual({
      xboxXuid1: "xuid-1",
      xboxXuid2: "xuid-2",
      queueChannelId: null,
      window: LeaderboardWindow.SixMonths,
      aggregation: LeaderboardMetricAggregation.AvgPerGame,
    });
  });
});
