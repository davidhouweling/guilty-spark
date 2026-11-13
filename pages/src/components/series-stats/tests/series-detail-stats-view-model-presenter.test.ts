import { describe, expect, it } from "vitest";
import type { MatchDetail, SeriesAggregation, SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import {
  aFakeMatchDetailWith,
  aFakeSeriesDetailResponseWith,
  aFakeSeriesPlayerWith,
  aFakeSeriesTeamWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import {
  aFakePlayerTeamStatsWith,
  aFakePlayerWith,
  aFakeTeamWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail-primitives.fake";
import { StatsDetailController } from "../../../controllers/stats/stats-detail-controller";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import { aFakeCtfMatchAnalyticsWith } from "../../../services/stats/fakes/match-analytics.fake";
import type { SeriesMatchAnalyticsById } from "../types";
import { SeriesDetailStatsViewModelPresenter } from "../series-detail-stats-view-model-presenter";

type ResolvedAggregation = Extract<SeriesAggregation, { status: "resolved" }>;

function createPresenter(locale?: string): SeriesDetailStatsViewModelPresenter {
  return new SeriesDetailStatsViewModelPresenter(new StatsDetailController(locale), locale);
}

function responseWith(
  details: readonly MatchDetail[],
  aggregation: ResolvedAggregation = {
    status: "resolved",
    gamesPlayed: 1,
    completedGameCount: 1,
    teams: [aFakeSeriesTeamWith({ seriesTeamId: 0 }), aFakeSeriesTeamWith({ seriesTeamId: 1 })],
    players: [aFakeSeriesPlayerWith()],
  },
): SeriesDetailResponse {
  const results = details.map((detail) => ({ status: "resolved" as const, matchId: detail.matchId, detail }));
  return aFakeSeriesDetailResponseWith({
    matches: { matchIds: results.map(({ matchId }) => matchId), results },
    aggregation,
  });
}

function rosterPlayer(
  playerId: string,
  matchTeamId: number,
  seriesTeamId: number,
  overrides: Partial<ReturnType<typeof aFakePlayerWith>> = {},
): ReturnType<typeof aFakePlayerWith> {
  return aFakePlayerWith({
    playerId,
    gamertag: playerId,
    lastMatchTeamId: matchTeamId,
    teamStats: [aFakePlayerTeamStatsWith({ matchTeamId, seriesTeamId })],
    ...overrides,
  });
}

describe("SeriesDetailStatsViewModelPresenter", () => {
  it("maps localized primary and secondary scores, details, metadata and pending analytics", () => {
    const detail = aFakeMatchDetailWith({
      durationSeconds: 125,
      score: {
        primary: {
          metric: "score",
          teams: [
            { matchTeamId: 7, seriesTeamId: 1, value: 2345 },
            { matchTeamId: 19, seriesTeamId: 0, value: 1234 },
          ],
        },
        secondary: {
          metric: "rounds-won",
          teams: [
            { matchTeamId: 7, seriesTeamId: 1, value: 4 },
            { matchTeamId: 19, seriesTeamId: 0, value: 3 },
          ],
        },
      },
      teams: [
        aFakeTeamWith({ matchTeamId: 7, seriesTeamId: 1, outcome: "Loss" }),
        aFakeTeamWith({ matchTeamId: 19, seriesTeamId: 0, outcome: "Win" }),
      ],
      teamCount: 2,
    });
    const aggregation: ResolvedAggregation = {
      status: "resolved",
      gamesPlayed: 2,
      completedGameCount: 1,
      teams: [
        aFakeSeriesTeamWith({ seriesTeamId: 1, gamesWon: 1 }),
        aFakeSeriesTeamWith({ seriesTeamId: 0, gamesWon: 2 }),
      ],
      players: [aFakeSeriesPlayerWith()],
    };
    const viewModel = createPresenter("en-US").present(responseWith([detail], aggregation));

    expect(viewModel.seriesScore).toBe("2:1");
    expect(viewModel.matchSummaries[0]).toMatchObject({
      gameScore: "1,234:2,345",
      gameSubScore: "3:4",
      gameMapThumbnailUrl: "data:,",
    });
    expect(viewModel.matchDetails[0]).toMatchObject({
      data: [{ teamId: 7 }, { teamId: 19 }],
      gameTypeAndMap: "Slayer: Live Fire",
      duration: "2m 5s",
      score: "1,234:2,345 (3:4)",
      killMatrixStatus: ComponentLoaderStatus.PENDING,
      crossTeamKillMatrixData: null,
      scoreProgressionStatus: ComponentLoaderStatus.PENDING,
      scoreProgressionViewData: null,
    });
    expect(viewModel.seriesStats).toMatchObject({
      killMatrixStatus: ComponentLoaderStatus.PENDING,
      scoreProgressionStatus: ComponentLoaderStatus.PENDING,
      killMatrixPivotData: { tableRows: [], columnHeaders: [] },
    });
    expect(viewModel.seriesStats?.metadata).toMatchObject({
      score: "2:1",
      startTime: detail.startTime,
      endTime: detail.endTime,
    });
  });

  it("transforms fetched match analytics and aggregates fetched kill matrices for series totals", () => {
    const firstMatch = aFakeMatchDetailWith({
      matchId: "first",
      teams: [
        aFakeTeamWith({ matchTeamId: 19, seriesTeamId: 1, playerIds: ["second"] }),
        aFakeTeamWith({ matchTeamId: 7, seriesTeamId: 0, playerIds: ["first"] }),
      ],
      players: [rosterPlayer("first", 7, 0, { xuid: "100" }), rosterPlayer("second", 19, 1, { xuid: "200" })],
      teamCount: 2,
    });
    const secondMatch = aFakeMatchDetailWith({
      matchId: "second",
      teams: [
        aFakeTeamWith({ matchTeamId: 31, seriesTeamId: 1, playerIds: ["second"] }),
        aFakeTeamWith({ matchTeamId: 12, seriesTeamId: 0, playerIds: ["first"] }),
      ],
      players: [rosterPlayer("first", 12, 0, { xuid: "100" }), rosterPlayer("second", 31, 1, { xuid: "200" })],
      teamCount: 2,
    });
    const aggregation: ResolvedAggregation = {
      status: "resolved",
      gamesPlayed: 2,
      completedGameCount: 2,
      teams: [
        aFakeSeriesTeamWith({ seriesTeamId: 1, playerIds: ["second"] }),
        aFakeSeriesTeamWith({ seriesTeamId: 0, playerIds: ["first"] }),
      ],
      players: [
        aFakeSeriesPlayerWith({ playerId: "first", xuid: "100", gamertag: "Alpha" }),
        aFakeSeriesPlayerWith({ playerId: "second", xuid: "200", gamertag: "Bravo" }),
      ],
    };
    const killMatrix = {
      "100:200": { count: 2, perfects: 1 },
      "200:100": { count: 1, perfects: 0 },
    };
    const analyticsByMatchId: SeriesMatchAnalyticsById = new Map([
      [
        "first",
        {
          killMatrix: { status: ComponentLoaderStatus.LOADED, data: killMatrix },
          scoreProgression: {
            status: ComponentLoaderStatus.LOADED,
            data: aFakeCtfMatchAnalyticsWith().scoreProgression,
          },
        },
      ],
      ["second", { killMatrix: { status: ComponentLoaderStatus.LOADED, data: killMatrix } }],
    ]);

    const viewModel = createPresenter().present(
      responseWith([firstMatch, secondMatch], aggregation),
      analyticsByMatchId,
    );

    expect(viewModel.matchDetails[0]).toMatchObject({
      killMatrixStatus: ComponentLoaderStatus.LOADED,
      scoreProgressionStatus: ComponentLoaderStatus.LOADED,
    });
    expect(viewModel.matchDetails[0]?.killMatrixPivotData.tableRows[0]).toMatchObject({
      killerId: "100",
      kills: new Map([
        ["100", 0],
        ["200", 2],
      ]),
    });
    expect(viewModel.matchDetails[0]?.scoreProgressionViewData).not.toBeNull();
    expect(viewModel.seriesStats?.killMatrixStatus).toBe(ComponentLoaderStatus.LOADED);
    expect(viewModel.seriesStats?.killMatrixPivotData.tableRows[0]).toMatchObject({
      killerId: "100",
      kills: new Map([
        ["100", 0],
        ["200", 4],
      ]),
    });
  });

  it("keeps module loading and error states independent", () => {
    const detail = aFakeMatchDetailWith();
    const analyticsByMatchId: SeriesMatchAnalyticsById = new Map([
      [
        detail.matchId,
        {
          killMatrix: {
            status: ComponentLoaderStatus.LOADED,
            data: { "1234567890:9876543210": { count: 3, perfects: 1 } },
          },
          scoreProgression: { status: ComponentLoaderStatus.ERROR, data: null },
        },
      ],
    ]);

    const viewModel = createPresenter().present(responseWith([detail]), analyticsByMatchId);

    expect(viewModel.matchDetails[0]).toMatchObject({
      killMatrixStatus: ComponentLoaderStatus.LOADED,
      scoreProgressionStatus: ComponentLoaderStatus.ERROR,
      scoreProgressionViewData: null,
    });
    expect(viewModel.seriesStats?.killMatrixStatus).toBe(ComponentLoaderStatus.LOADED);

    const loadingAnalyticsByMatchId: SeriesMatchAnalyticsById = new Map([
      [
        detail.matchId,
        {
          killMatrix: { status: ComponentLoaderStatus.LOADING, data: null },
          scoreProgression: { status: ComponentLoaderStatus.ERROR, data: null },
        },
      ],
    ]);
    const loadingViewModel = createPresenter().present(responseWith([detail]), loadingAnalyticsByMatchId);

    expect(loadingViewModel.matchDetails[0]).toMatchObject({
      killMatrixStatus: ComponentLoaderStatus.LOADING,
      scoreProgressionStatus: ComponentLoaderStatus.ERROR,
    });
    expect(loadingViewModel.seriesStats?.killMatrixStatus).toBe(ComponentLoaderStatus.LOADING);
  });

  it("keeps winner and team cards stable when match-side IDs swap", () => {
    const older = aFakeMatchDetailWith({ matchId: "older", endTime: "2025-01-01T00:01:00.000Z" });
    const latest = aFakeMatchDetailWith({
      matchId: "latest",
      endTime: "2025-01-01T00:03:00.000Z",
      teams: [
        aFakeTeamWith({ matchTeamId: 21, seriesTeamId: 3, outcome: "Loss", name: "Side B", playerIds: ["b"] }),
        aFakeTeamWith({ matchTeamId: 11, seriesTeamId: 2, outcome: "Win", name: "Side A", playerIds: ["a", "joined"] }),
      ],
      players: [
        rosterPlayer("b", 21, 3),
        rosterPlayer("a", 11, 2),
        rosterPlayer("joined", 11, 2, {
          participation: {
            presentAtBeginning: false,
            joinedInProgress: true,
            leftInProgress: false,
            presentAtCompletion: true,
          },
        }),
      ],
      teamCount: 2,
    });
    const aggregation: ResolvedAggregation = {
      status: "resolved",
      gamesPlayed: 2,
      completedGameCount: 2,
      teams: [
        aFakeSeriesTeamWith({ seriesTeamId: 3, name: "Bravo", gamesWon: 1 }),
        aFakeSeriesTeamWith({ seriesTeamId: 2, name: "Alpha", gamesWon: 1 }),
      ],
      players: [
        aFakeSeriesPlayerWith({ playerId: "b", gamertag: "Beta" }),
        aFakeSeriesPlayerWith({ playerId: "a", gamertag: "Alpha Player" }),
      ],
    };
    const viewModel = createPresenter().present(responseWith([older, latest], aggregation));

    expect(viewModel.matchSummaries[1]?.winningTeamColorHex).toBe("#FE3939");
    expect(viewModel.matchDetails[1]?.teamColors[11]?.hex).toBe("#FE3939");
    expect(viewModel.matchDetails[1]?.teamColors[21]?.hex).toBe("#3B9DFF");
    expect(viewModel.seriesStats?.teamColors[2]?.hex).toBe("#FE3939");
    expect(viewModel.seriesStats?.teamColors[3]?.hex).toBe("#3B9DFF");
    expect(viewModel.teams).toEqual([
      { name: "Alpha", players: ["Alpha Player"], teamColorHex: "#FE3939" },
      { name: "Bravo", players: ["Beta"], teamColorHex: "#3B9DFF" },
    ]);
  });

  it("applies team color overrides by stable team slot without changing scores, names or kill matrix labels", () => {
    const latest = aFakeMatchDetailWith({
      matchId: "latest",
      teams: [
        aFakeTeamWith({ matchTeamId: 21, seriesTeamId: 3, outcome: "Win", name: "Side B", playerIds: ["b"] }),
        aFakeTeamWith({ matchTeamId: 11, seriesTeamId: 2, outcome: "Loss", name: "Side A", playerIds: ["a"] }),
      ],
      players: [rosterPlayer("b", 21, 3), rosterPlayer("a", 11, 2)],
      teamCount: 2,
    });
    const aggregation: ResolvedAggregation = {
      status: "resolved",
      gamesPlayed: 1,
      completedGameCount: 1,
      teams: [
        aFakeSeriesTeamWith({ seriesTeamId: 3, name: "Bravo", gamesWon: 1 }),
        aFakeSeriesTeamWith({ seriesTeamId: 2, name: "Alpha", gamesWon: 0 }),
      ],
      players: [aFakeSeriesPlayerWith({ playerId: "b", gamertag: "Beta" })],
    };
    const response = responseWith([latest], aggregation);
    const analyticsByMatchId: SeriesMatchAnalyticsById = new Map([
      [
        "latest",
        { killMatrix: { status: ComponentLoaderStatus.LOADED, data: aFakeCtfMatchAnalyticsWith().killMatrix } },
      ],
    ]);
    const presenter = createPresenter();

    const defaults = presenter.present(response, analyticsByMatchId);
    const custom = presenter.present(response, analyticsByMatchId, {
      teamColors: [getTeamColorOrDefault("jade", 0)],
    });

    expect(custom.matchDetails[0]?.teamColors[11]?.hex).toBe("#8AFFBE");
    expect(custom.matchDetails[0]?.teamColors[21]?.hex).toBe("#3B9DFF");
    expect(custom.matchSummaries[0]?.winningTeamColorHex).toBe("#3B9DFF");
    expect(custom.seriesStats?.teamColors[2]?.hex).toBe("#8AFFBE");
    expect(custom.seriesStats?.teamColors[3]?.hex).toBe("#3B9DFF");
    expect(custom.teams.map(({ teamColorHex }) => teamColorHex)).toEqual(["#8AFFBE", "#3B9DFF"]);
    expect(custom.seriesScore).toBe(defaults.seriesScore);
    expect(custom.matchSummaries[0]?.gameScore).toBe(defaults.matchSummaries[0]?.gameScore);
    expect(custom.teams.map(({ name, players }) => ({ name, players }))).toEqual(
      defaults.teams.map(({ name, players }) => ({ name, players })),
    );
    expect(custom.seriesStats?.killMatrixPivotData).toEqual(defaults.seriesStats?.killMatrixPivotData);
    expect(custom.matchDetails[0]?.killMatrixPivotData).toEqual(defaults.matchDetails[0]?.killMatrixPivotData);
  });

  it("includes bots in team cards with the existing display label", () => {
    const detail = aFakeMatchDetailWith({
      teams: [aFakeTeamWith({ matchTeamId: 7, seriesTeamId: 0, playerIds: ["human", "bot"] })],
      players: [rosterPlayer("human", 7, 0), rosterPlayer("bot", 7, 0, { playerType: 2, gamertag: null })],
      teamCount: 1,
    });

    const viewModel = createPresenter().present(responseWith([detail]));

    expect(viewModel.teams[0]?.players).toEqual(["human", "Bot"]);
  });

  it("uses team slots for non-sequential match team IDs without stable series IDs", () => {
    const detail = aFakeMatchDetailWith({
      teams: [
        aFakeTeamWith({ matchTeamId: 19, seriesTeamId: null, outcome: "Loss" }),
        aFakeTeamWith({ matchTeamId: 7, seriesTeamId: null, outcome: "Win" }),
      ],
      teamCount: 2,
    });
    const viewModel = createPresenter().present(responseWith([detail]));

    expect(viewModel.matchSummaries[0]?.winningTeamColorHex).toBe("#FE3939");
    expect(viewModel.matchDetails[0]?.teamColors[7]?.hex).toBe("#FE3939");
    expect(viewModel.matchDetails[0]?.teamColors[19]?.hex).toBe("#3B9DFF");
  });

  it("retains unavailable matches and reports unavailable aggregation without deriving totals", () => {
    const response = aFakeSeriesDetailResponseWith({
      matches: { matchIds: ["missing"], results: [{ status: "unavailable", matchId: "missing", reason: "not-found" }] },
      aggregation: { status: "unavailable", reason: "incomplete-matches" },
    });
    const viewModel = createPresenter().present(response);

    expect(viewModel.seriesScore).toBe("Unavailable");
    expect(viewModel.seriesStats).toBeNull();
    expect(viewModel.seriesStatsWarning).toContain("Series totals are unavailable");
    expect(viewModel.matchSummaries).toHaveLength(1);
    expect(viewModel.matchDetails[0]).toMatchObject({ matchId: "missing", data: null });
  });

  it("uses series context labels and clear defaults when context is absent", () => {
    const presenter = createPresenter();
    const details = [aFakeMatchDetailWith()];

    expect(
      presenter.present(
        aFakeSeriesDetailResponseWith({ ...responseWith(details), context: { title: "League", subtitle: "Queue #8" } }),
      ),
    ).toMatchObject({ title: "League", subtitle: "Queue #8" });
    expect(presenter.present(responseWith(details))).toMatchObject({
      title: "Series stats",
      subtitle: "Series details unavailable",
    });
  });
});
