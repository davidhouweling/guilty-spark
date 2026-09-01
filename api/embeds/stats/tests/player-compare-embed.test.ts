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
  createPlayerCompareHeadToHeadEmbeds,
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
        headToHead: false,
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
        headToHead: false,
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
        headToHead: false,
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

describe("createPlayerCompareHeadToHeadEmbeds()", () => {
  it("renders symmetric counts and per-player win-rate/kill values", () => {
    const stats1 = aFakeLeaderboardPlayerStatsRow({ XboxXuid: "xuid-1", Gamertag: "player-one" });
    const stats2 = aFakeLeaderboardPlayerStatsRow({ XboxXuid: "xuid-2", Gamertag: "player-two" });

    const response = createPlayerCompareHeadToHeadEmbeds({
      pair: {
        SeriesPlayedWith: 2,
        Player1SeriesWinsWith: 1,
        SeriesPlayedAgainst: 4,
        Player1SeriesWinsAgainst: 1,
        Player2SeriesWinsAgainst: 3,
        GamesPlayedWith: 5,
        Player1GameWinsWith: 3,
        GamesPlayedAgainst: 10,
        Player1GameWinsAgainst: 4,
        Player2GameWinsAgainst: 6,
        HeadToHeadGamesPlayed: 10,
        Player1Kills: 20,
        Player1Perfects: 2,
        Player2Kills: 30,
        Player2Perfects: 1,
      },
      stats1,
      stats2,
      state: {
        xboxXuid1: "xuid-1",
        xboxXuid2: "xuid-2",
        queueChannelId: null,
        window: LeaderboardWindow.ThreeMonths,
        aggregation: null,
        headToHead: true,
      },
      queueLabel: "all configured queues",
      queueOptions: [],
      resetAt: null,
      locale: "en-US",
    });

    const [embed] = response.embeds;
    expect(embed?.title).toBe("player-one vs player-two - Head to head");

    const [statField, player1Field, player2Field] = embed?.fields ?? [];
    const statLines = statField?.value.split("\n") ?? [];
    const player1Lines = player1Field?.value.split("\n") ?? [];
    const player2Lines = player2Field?.value.split("\n") ?? [];
    const seriesWinRateIndex = statLines.indexOf("Series win % vs");
    const gamesWinRateIndex = statLines.indexOf("Games win % vs");
    const killsIndex = statLines.indexOf("Kills vs");
    const matchupField = embed?.fields?.find((field) => field.name === "Matchup");

    expect(player1Lines[seriesWinRateIndex]).toBe("25% (1/4)");
    expect(player2Lines[seriesWinRateIndex]).toBe("75% (3/4)");
    expect(player1Lines[gamesWinRateIndex]).toBe("40% (4/10)");
    expect(player2Lines[gamesWinRateIndex]).toBe("60% (6/10)");
    expect(player1Lines[killsIndex]).toBe("20 (2 perfects)");
    expect(player2Lines[killsIndex]).toBe("30 (1 perfect)");
    expect(matchupField).toEqual({
      name: "Matchup",
      value: "Together: 2 series, 1 win (50%) | 5 games, 3 wins (60%)",
      inline: false,
    });
  });

  it("shows n/a for win rate and average kills when players have never played against each other", () => {
    const stats1 = aFakeLeaderboardPlayerStatsRow({ XboxXuid: "xuid-1", Gamertag: "player-one" });
    const stats2 = aFakeLeaderboardPlayerStatsRow({ XboxXuid: "xuid-2", Gamertag: "player-two" });

    const response = createPlayerCompareHeadToHeadEmbeds({
      pair: {
        SeriesPlayedWith: 1,
        Player1SeriesWinsWith: 0,
        SeriesPlayedAgainst: 0,
        Player1SeriesWinsAgainst: 0,
        Player2SeriesWinsAgainst: 0,
        GamesPlayedWith: 2,
        Player1GameWinsWith: 1,
        GamesPlayedAgainst: 0,
        Player1GameWinsAgainst: 0,
        Player2GameWinsAgainst: 0,
        HeadToHeadGamesPlayed: 0,
        Player1Kills: 0,
        Player1Perfects: 0,
        Player2Kills: 0,
        Player2Perfects: 0,
      },
      stats1,
      stats2,
      state: {
        xboxXuid1: "xuid-1",
        xboxXuid2: "xuid-2",
        queueChannelId: null,
        window: LeaderboardWindow.ThreeMonths,
        aggregation: null,
        headToHead: true,
      },
      queueLabel: "all configured queues",
      queueOptions: [],
      resetAt: null,
      locale: "en-US",
    });

    const [embed] = response.embeds;
    const [statField, player1Field] = embed?.fields ?? [];
    const statLines = statField?.value.split("\n") ?? [];
    const player1Lines = player1Field?.value.split("\n") ?? [];
    const seriesWinRateIndex = statLines.indexOf("Series win % vs");
    const avgKillsIndex = statLines.indexOf("Avg kills/game vs");
    const matchupField = embed?.fields?.find((field) => field.name === "Matchup");

    expect(player1Lines[seriesWinRateIndex]).toBe("n/a");
    expect(player1Lines[avgKillsIndex]).toBe("n/a");
    expect(matchupField?.value).toBe("Together: 1 series, 0 wins (0%) | 2 games, 1 win (50%)");
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
        headToHead: false,
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
        headToHead: false,
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

  it("parses a head-to-head selection from the message", () => {
    const message = createPlayerCompareHeadToHeadEmbeds({
      pair: {
        SeriesPlayedWith: 2,
        Player1SeriesWinsWith: 1,
        SeriesPlayedAgainst: 3,
        Player1SeriesWinsAgainst: 1,
        Player2SeriesWinsAgainst: 2,
        GamesPlayedWith: 5,
        Player1GameWinsWith: 3,
        GamesPlayedAgainst: 7,
        Player1GameWinsAgainst: 3,
        Player2GameWinsAgainst: 4,
        HeadToHeadGamesPlayed: 7,
        Player1Kills: 20,
        Player1Perfects: 1,
        Player2Kills: 15,
        Player2Perfects: 0,
      },
      stats1: aFakeLeaderboardPlayerStatsRow({ XboxXuid: "xuid-1", Gamertag: "player-one" }),
      stats2: aFakeLeaderboardPlayerStatsRow({ XboxXuid: "xuid-2", Gamertag: "player-two" }),
      state: {
        xboxXuid1: "xuid-1",
        xboxXuid2: "xuid-2",
        queueChannelId: null,
        window: LeaderboardWindow.ThreeMonths,
        aggregation: null,
        headToHead: true,
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
      window: LeaderboardWindow.ThreeMonths,
      aggregation: null,
      headToHead: true,
    });
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
        headToHead: false,
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
      headToHead: false,
    });
  });
});
