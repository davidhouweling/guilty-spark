import { describe, expect, it } from "vitest";
import {
  aFakeMatchDetailWith,
  aFakeSeriesPlayerWith,
  aFakeSeriesDetailResponseWith,
  aFakeSeriesTeamWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { aFakeTeamWith } from "@guilty-spark/shared/contracts/stats/fakes/detail-primitives.fake";
import { aFakeMatchAnalyticsWith } from "../../../controllers/stats/kill-matrix/fakes/match-analytics.fake";
import { StatsDetailController } from "../../../controllers/stats/stats-detail-controller";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import { aFakeScoreProgressionWith } from "../../stats/score-progression/fakes/score-progression.fake";
import { SeriesDetailStatsViewModelPresenter } from "../series-detail-stats-view-model-presenter";
import { aFakeSeriesDetailWithTeamSwap } from "../fakes/series-detail-team-swap.fake";

describe("SeriesDetailStatsViewModelPresenter", () => {
  it("uses series context labels", () => {
    const response = aFakeSeriesDetailResponseWith({
      context: { title: "League", subtitle: "Queue #8" },
    });

    expect(new SeriesDetailStatsViewModelPresenter(new StatsDetailController()).present(response)).toMatchObject({
      title: "League",
      subtitle: "Queue #8",
    });
  });

  it("keeps timeline colors aligned with raw team IDs when series sides swap", () => {
    const detail = aFakeMatchDetailWith({
      teamCount: 2,
      teams: [aFakeTeamWith({ matchTeamId: 7, seriesTeamId: 1 }), aFakeTeamWith({ matchTeamId: 19, seriesTeamId: 0 })],
    });
    const response = aFakeSeriesDetailResponseWith({
      matches: {
        matchIds: [detail.matchId],
        results: [{ status: "resolved", matchId: detail.matchId, detail }],
      },
    });
    const scoreProgression = aFakeScoreProgressionWith({
      timeline: {
        type: "kill-race",
        events: [{ timestampMs: 5000, teamId: 7, runningScores: { "7": 1, "19": 0 } }],
        deathTimeline: [],
        respawnDurationMs: 8000,
      },
    });

    const viewModel = new SeriesDetailStatsViewModelPresenter(new StatsDetailController()).present(
      response,
      new Map([
        [detail.matchId, { scoreProgression: { status: ComponentLoaderStatus.LOADED, data: scoreProgression } }],
      ]),
    );

    expect(viewModel.matchDetails[0]?.scoreProgressionViewData).toMatchObject({
      kind: "score-lines",
      teamLines: [
        { teamId: 7, color: "#3B9DFF" },
        { teamId: 19, color: "#FE3939" },
      ],
    });
  });

  it("accumulates kill-matrix analytics once for duplicate match IDs", () => {
    const response = aFakeSeriesDetailResponseWith({
      matches: {
        matchIds: ["match-one", "match-one"],
        results: [
          {
            status: "resolved",
            matchId: "match-one",
            detail: aFakeMatchDetailWith(),
          },
        ],
      },
    });
    const analytics = aFakeMatchAnalyticsWith({
      killMatrix: { "1234567890:1234567890": { count: 3, perfects: 1 } },
    });

    const viewModel = new SeriesDetailStatsViewModelPresenter(new StatsDetailController()).present(
      response,
      new Map([["match-one", { killMatrix: { status: ComponentLoaderStatus.LOADED, data: analytics.killMatrix } }]]),
    );

    expect(viewModel.seriesStats?.killMatrixPivotData.tableRows[0]?.kills.get("1234567890")).toBe(3);
  });

  it("keeps conflicting team memberships in the full matrix without cross-team totals", () => {
    const response = aFakeSeriesDetailResponseWith({
      aggregation: {
        status: "resolved",
        gamesPlayed: 2,
        completedGameCount: 1,
        teams: [
          aFakeSeriesTeamWith({ seriesTeamId: 0, playerIds: ["player-one", "player-switching"] }),
          aFakeSeriesTeamWith({ seriesTeamId: 1, playerIds: ["player-two", "player-switching"] }),
        ],
        players: [
          aFakeSeriesPlayerWith({
            playerId: "player-one",
            xuid: "111",
            gamertag: "One",
            teamStats: [{ seriesTeamId: 0, gamesPlayed: 2, stats: [], medals: [] }],
          }),
          aFakeSeriesPlayerWith({
            playerId: "player-two",
            xuid: "222",
            gamertag: "Two",
            teamStats: [{ seriesTeamId: 1, gamesPlayed: 2, stats: [], medals: [] }],
          }),
          aFakeSeriesPlayerWith({
            playerId: "player-switching",
            xuid: "333",
            gamertag: "Switching",
            teamStats: [
              { seriesTeamId: 0, gamesPlayed: 1, stats: [], medals: [] },
              { seriesTeamId: 1, gamesPlayed: 1, stats: [], medals: [] },
            ],
          }),
        ],
      },
    });
    const analytics = aFakeMatchAnalyticsWith({
      killMatrix: {
        "111:333": { count: 2, perfects: 0 },
        "333:222": { count: 4, perfects: 1 },
      },
    });

    const viewModel = new SeriesDetailStatsViewModelPresenter(new StatsDetailController()).present(
      response,
      new Map([["match-one", { killMatrix: { status: ComponentLoaderStatus.LOADED, data: analytics.killMatrix } }]]),
    );

    const { seriesStats } = viewModel;
    expect(seriesStats?.crossTeamKillMatrixData).toBeNull();
    expect(seriesStats?.swappedCrossTeamKillMatrixData).toBeNull();
    expect(seriesStats?.killMatrixPivotData.columnHeaders).toContainEqual({
      xuid: "333",
      gamertag: "Switching",
      teamId: null,
    });
    expect(seriesStats?.killMatrixPivotData.columnHeaders.filter(({ xuid }) => xuid === "333")).toHaveLength(1);
    expect(
      seriesStats?.killMatrixPivotData.tableRows.find(({ killerId }) => killerId === "111")?.kills.get("333"),
    ).toBe(2);
    expect(
      seriesStats?.killMatrixPivotData.tableRows.find(({ killerId }) => killerId === "333")?.kills.get("222"),
    ).toBe(4);
  });

  it("uses the latest roster for matrix display without moving historical team totals", () => {
    const response = aFakeSeriesDetailWithTeamSwap();
    const viewModel = new SeriesDetailStatsViewModelPresenter(new StatsDetailController()).present(
      response,
      new Map([
        [
          "match-one",
          {
            killMatrix: {
              status: ComponentLoaderStatus.LOADED,
              data: { "111:333": { count: 4, perfects: 1 }, "111:222": { count: 2, perfects: 0 } },
            },
          },
        ],
        [
          "match-two",
          {
            killMatrix: {
              status: ComponentLoaderStatus.LOADED,
              data: { "111:333": { count: 6, perfects: 2 }, "111:222": { count: 3, perfects: 0 } },
            },
          },
        ],
      ]),
    );

    expect(viewModel.teams.map(({ name, players }) => ({ name, players }))).toEqual([
      { name: "Eagle", players: ["Bravo"] },
      { name: "Cobra", players: ["Alpha", "Charlie"] },
    ]);
    expect(viewModel.seriesStats?.crossTeamKillMatrixData).toBeNull();
    expect(viewModel.seriesStats?.killMatrixPivotData.tableRows).toMatchObject([{ killerId: "111", killerTeamId: 1 }]);
    expect(viewModel.seriesStats?.killMatrixPivotData.columnHeaders).toEqual([
      { xuid: "222", gamertag: "Bravo", teamId: 0 },
      { xuid: "333", gamertag: "Charlie", teamId: 1 },
    ]);
    expect(viewModel.seriesStats?.killMatrixPivotData.tableRows[0]?.kills.get("222")).toBe(5);
    expect(viewModel.seriesStats?.killMatrixPivotData.tableRows[0]?.kills.get("333")).toBe(10);
    expect(viewModel.seriesStats?.killMatrixPivotData.tableRows[0]?.perfects.get("333")).toBe(3);
    expect(viewModel.seriesStats?.teamData.map(({ teamId, teamStats }) => [teamId, teamStats[0]?.value])).toEqual([
      [0, 12],
      [1, 18],
    ]);
    expect(
      viewModel.seriesStats?.playerData.map(({ players }) =>
        players.map(({ name, values }) => [name, values[0]?.value]),
      ),
    ).toEqual([
      [
        ["Alpha (1/2 games)", 5],
        ["Bravo (1/2 games)", 5],
      ],
      [
        ["Bravo (1/2 games)", 8],
        ["Charlie", 8],
        ["Alpha (1/2 games)", 8],
      ],
    ]);
    expect(
      viewModel.matchDetails.map(({ crossTeamKillMatrixData }) => crossTeamKillMatrixData?.tableRows[0]?.playerTeamId),
    ).toEqual([7, 7]);
  });

  it("does not present zero cross-team totals when all loaded kill matrices are unavailable", () => {
    const response = aFakeSeriesDetailResponseWith({
      aggregation: {
        status: "resolved",
        gamesPlayed: 2,
        completedGameCount: 1,
        teams: [
          aFakeSeriesTeamWith({ seriesTeamId: 0, playerIds: ["player-one"] }),
          aFakeSeriesTeamWith({ seriesTeamId: 1, playerIds: ["player-two"] }),
        ],
        players: [
          aFakeSeriesPlayerWith({
            playerId: "player-one",
            xuid: "111",
            teamStats: [{ seriesTeamId: 0, gamesPlayed: 2, stats: [], medals: [] }],
          }),
          aFakeSeriesPlayerWith({
            playerId: "player-two",
            xuid: "222",
            teamStats: [{ seriesTeamId: 1, gamesPlayed: 2, stats: [], medals: [] }],
          }),
        ],
      },
    });

    const viewModel = new SeriesDetailStatsViewModelPresenter(new StatsDetailController()).present(
      response,
      new Map([["match-one", { killMatrix: { status: ComponentLoaderStatus.LOADED, data: null } }]]),
    );

    expect(viewModel.seriesStats?.killMatrixStatus).toBe(ComponentLoaderStatus.LOADED);
    expect(viewModel.seriesStats?.crossTeamKillMatrixData).toBeNull();
    expect(viewModel.seriesStats?.swappedCrossTeamKillMatrixData).toBeNull();
  });

  it("presents an empty non-null kill matrix as zero cross-team totals", () => {
    const response = aFakeSeriesDetailResponseWith({
      aggregation: {
        status: "resolved",
        gamesPlayed: 2,
        completedGameCount: 1,
        teams: [
          aFakeSeriesTeamWith({ seriesTeamId: 0, playerIds: ["player-one"] }),
          aFakeSeriesTeamWith({ seriesTeamId: 1, playerIds: ["player-two"] }),
        ],
        players: [
          aFakeSeriesPlayerWith({
            playerId: "player-one",
            xuid: "111",
            teamStats: [{ seriesTeamId: 0, gamesPlayed: 2, stats: [], medals: [] }],
          }),
          aFakeSeriesPlayerWith({
            playerId: "player-two",
            xuid: "222",
            teamStats: [{ seriesTeamId: 1, gamesPlayed: 2, stats: [], medals: [] }],
          }),
        ],
      },
    });

    const viewModel = new SeriesDetailStatsViewModelPresenter(new StatsDetailController()).present(
      response,
      new Map([["match-one", { killMatrix: { status: ComponentLoaderStatus.LOADED, data: {} } }]]),
    );

    expect(viewModel.seriesStats?.crossTeamKillMatrixData?.tableRows).toHaveLength(1);
    expect(viewModel.seriesStats?.crossTeamKillMatrixData?.tableRows[0]?.cells.get("222")).toMatchObject({
      kills: 0,
      deaths: 0,
      killPerfects: 0,
      deathPerfects: 0,
    });
  });
});
