import { describe, expect, it } from "vitest";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import { StatsController } from "../../../controllers/stats/stats-controller";
import { aFakeCoreStatsWith, aFakeMatchStatsWith, aFakePlayerWith } from "../../../controllers/stats/fakes/data";
import { aFakeMatchAnalyticsServiceWith } from "../../../services/stats/fakes/match-analytics.fake";
import { DiscordSeriesStatsPresenter } from "../discord-series-stats-presenter";
import { DiscordSeriesStatsStore } from "../discord-series-stats-store";

describe("DiscordSeriesStatsPresenter.present", () => {
  it("orders kill matrix players correctly when some players have a games-played suffix", () => {
    // Match A: all 4 players present
    const matchA = aFakeMatchStatsWith({ MatchId: "match-a" });

    // Match B: player 1111111111 is absent — they will get a "(1/2 games)" suffix in series stats
    const matchB = aFakeMatchStatsWith({
      MatchId: "match-b",
      Players: [
        aFakePlayerWith({
          PlayerId: "xuid(2222222222)",
          LastTeamId: 0,
          Rank: 4,
          PlayerTeamStats: [
            {
              TeamId: 0,
              Stats: {
                CoreStats: aFakeCoreStatsWith({ Kills: 8, Deaths: 12, Assists: 3, PersonalScore: 1200 }),
                PvpStats: { Kills: 8, Deaths: 12, Assists: 3, KDA: 0.92 },
              },
            },
          ],
        }),
        aFakePlayerWith({
          PlayerId: "xuid(3333333333)",
          LastTeamId: 1,
          Rank: 1,
          PlayerTeamStats: [
            {
              TeamId: 1,
              Stats: {
                CoreStats: aFakeCoreStatsWith({ Kills: 25, Deaths: 10, Assists: 15, PersonalScore: 4000 }),
                PvpStats: { Kills: 25, Deaths: 10, Assists: 15, KDA: 4 },
              },
            },
          ],
        }),
        aFakePlayerWith({
          PlayerId: "xuid(4444444444)",
          LastTeamId: 1,
          Rank: 2,
          PlayerTeamStats: [
            {
              TeamId: 1,
              Stats: {
                CoreStats: aFakeCoreStatsWith({ Kills: 20, Deaths: 11, Assists: 12, PersonalScore: 3200 }),
                PvpStats: { Kills: 20, Deaths: 11, Assists: 12, KDA: 2.91 },
              },
            },
          ],
        }),
      ],
    });

    const playerXuidToGametag = {
      "1111111111": "1111111111",
      "2222222222": "2222222222",
      "3333333333": "3333333333",
      "4444444444": "4444444444",
    };

    const renderData: DiscordSeriesStatsPresenter["renderData"] = {
      title: "Series",
      subtitle: "Test",
      seriesScore: "1:1",
      medalMetadata: {},
      teams: [
        { name: "Eagle", players: ["1111111111", "2222222222"] },
        { name: "Cobra", players: ["3333333333", "4444444444"] },
      ],
      matches: [
        {
          matchId: "match-a",
          gameTypeAndMap: "Slayer: Live Fire",
          gameVariantCategory: 9,
          gameType: "Slayer",
          gameMap: "Live Fire",
          gameMapThumbnailUrl: "data:,",
          duration: "10m 00s",
          gameScore: "50:45",
          gameSubScore: null,
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:10:00.000Z",
          playerXuidToGametag,
          rawMatch: matchA,
        },
        {
          matchId: "match-b",
          gameTypeAndMap: "Slayer: Live Fire",
          gameVariantCategory: 9,
          gameType: "Slayer",
          gameMap: "Live Fire",
          gameMapThumbnailUrl: "data:,",
          duration: "10m 00s",
          gameScore: "45:50",
          gameSubScore: null,
          startTime: "2026-01-01T00:15:00.000Z",
          endTime: "2026-01-01T00:25:00.000Z",
          playerXuidToGametag,
          rawMatch: matchB,
        },
      ],
    };

    const analytics: MatchAnalytics = {
      requestedModules: ["killMatrix"],
      killMatrix: {
        "3333333333:1111111111": { count: 2, headshotKills: 0, perfects: 0, weapons: [] },
        "1111111111:3333333333": { count: 1, headshotKills: 0, perfects: 0, weapons: [] },
      },
      metadata: {
        pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 1 },
        perfectCounts: { total: 0, byXuid: {} },
      },
    };

    const store = new DiscordSeriesStatsStore();
    store.update({
      analyticsByMatchId: new Map([
        ["match-a", analytics],
        ["match-b", analytics],
      ]),
      analyticsStatus: ComponentLoaderStatus.LOADED,
    });

    const presenter = new DiscordSeriesStatsPresenter(
      renderData,
      new StatsController(),
      store,
      aFakeMatchAnalyticsServiceWith(),
    );

    const vm = presenter.present(store.getSnapshot());

    // Team 0 (1111111111) should appear before team 1 (3333333333).
    // Without the games-suffix fix, 1111111111 is dropped from orderedPlayers
    // because its series name is "1111111111 (1/2 games)".
    const killerOrder = vm.seriesStats?.killMatrixPivotData.tableRows.map((r) => r.killerGamertag) ?? [];
    expect(killerOrder).toEqual(["1111111111", "3333333333"]);
  });
});
