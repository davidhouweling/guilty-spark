import { describe, expect, it } from "vitest";
import {
  aFakeMatchDetailWith,
  aFakeSeriesDetailResponseWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { aFakeTeamWith } from "@guilty-spark/shared/contracts/stats/fakes/detail-primitives.fake";
import { aFakeMatchAnalyticsWith } from "../../../controllers/stats/kill-matrix/fakes/match-analytics.fake";
import { StatsDetailController } from "../../../controllers/stats/stats-detail-controller";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import { aFakeScoreProgressionWith } from "../../stats/score-progression/fakes/score-progression.fake";
import { SeriesDetailStatsViewModelPresenter } from "../series-detail-stats-view-model-presenter";

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
});
