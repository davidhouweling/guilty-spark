import { describe, expect, it } from "vitest";
import type { MatchDetail, SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import type { TrackerSeriesTeam, TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { ComponentLoaderStatus } from "../../../component-loader/component-loader";
import type { IndividualTrackerViewerSnapshot } from "../viewer-store";
import { IndividualTrackerViewerPresenter } from "../viewer-presenter";
import {
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerSeriesGroupWith,
  aFakeTrackerViewStateWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import type { ViewerEntryState, ViewerSeriesTab } from "../types";
import { aFakeViewerSeriesDetailWith, aFakeViewerSeriesMatchWith } from "../fakes/series-detail.fake";

function presentOverview(view: TrackerViewState, data: SeriesDetailResponse): ViewerSeriesTab["seriesOverview"] {
  const snapshot: IndividualTrackerViewerSnapshot = {
    status: ComponentLoaderStatus.LOADED,
    errorMessage: null,
    view,
    connectionStatus: "connected",
    refreshPending: false,
    expandedEntryKeys: new Set(),
    entryStates: new Map([
      [
        "series:s1",
        { kind: "series", state: { status: "loaded", seriesId: "s1", data, analyticsByMatchId: new Map() } },
      ],
    ]),
    hasMore: false,
    loadingMore: false,
    loadMoreError: null,
  };
  const item = IndividualTrackerViewerPresenter.present(snapshot).renderModel?.timeline[0];
  if (item?.type !== "series") {
    throw new Error("Expected a series timeline item");
  }
  return item.series.seriesOverview;
}

describe("IndividualTrackerViewerPresenter", () => {
  it("colors winning tiles using configured team identity across a side swap and substitution", () => {
    const anchor = aFakeViewerSeriesMatchWith({
      matchId: "m1",
      teams: aFakeViewerSeriesMatchWith().teams.map((team) => ({
        ...team,
        outcome: team.matchTeamId === 0 ? "Win" : "Loss",
      })),
    });
    const swapped = aFakeViewerSeriesMatchWith({
      matchId: "m2",
      teams: anchor.teams.map((team) => ({
        ...team,
        matchTeamId: 1 - team.matchTeamId,
        outcome: team.seriesTeamId === 1 ? "Win" : "Loss",
      })),
      players: anchor.players.map((player) => ({
        ...player,
        playerId: player.playerId === "xuid(4444444444)" ? "xuid(5555555555)" : player.playerId,
        lastMatchTeamId: 1 - (player.lastMatchTeamId ?? 0),
      })),
    });
    const teams: TrackerSeriesTeam[] = [
      {
        id: 8,
        name: "Eagle",
        players: ["3333333333", "4444444444"].map((xboxId) => ({
          xboxId,
          discordId: null,
          discordName: null,
          gamertag: null,
        })),
      },
      {
        id: 9,
        name: "Cobra",
        players: ["1111111111", "2222222222"].map((xboxId) => ({
          xboxId,
          discordId: null,
          discordName: null,
          gamertag: null,
        })),
      },
    ];
    const view = {
      ...aFakeTrackerViewStateWith({
        matches: [aFakeTrackerMatchSummaryWith({ matchId: "m1" }), aFakeTrackerMatchSummaryWith({ matchId: "m2" })],
        series: [{ ...aFakeTrackerSeriesGroupWith({ id: "s1", matchIds: ["m1", "m2"] }), teams }],
      }),
      streamerSettings: { styleFlags: { playerTeamColor: "mint", playerEnemyColor: "sunshine" } },
    };
    const data = aFakeViewerSeriesDetailWith(["m1", "m2"], {
      matches: {
        matchIds: ["m1", "m2"],
        results: [anchor, swapped].map((detail) => ({ status: "resolved", matchId: detail.matchId, detail })),
      },
    });

    const overview = presentOverview(view, data);
    expect(overview.teams.map((team) => team.teamColorHex)).toEqual(["#23ED7D", "#FCF55C"]);
    expect(overview.matches.map((match) => match.teamColorHex)).toEqual(["#FCF55C", "#23ED7D"]);
  });

  it("keeps ties, unmapped sides, unavailable matches, and unmatched configured rosters neutral", () => {
    const matchIds = ["m1", "m2", "m3"];
    const anchor = aFakeViewerSeriesMatchWith({
      matchId: "m1",
      teams: aFakeViewerSeriesMatchWith().teams.map((team) => ({
        ...team,
        outcome: team.matchTeamId === 0 ? "Win" : "Loss",
      })),
    });
    const tie: MatchDetail = {
      ...anchor,
      matchId: "m2",
      teams: anchor.teams.map((team) => ({ ...team, outcome: "Tie" })),
    };
    const unmapped: MatchDetail = {
      ...anchor,
      matchId: "m3",
      teams: anchor.teams.map((team) => ({ ...team, seriesTeamId: null })),
    };
    const view = aFakeTrackerViewStateWith({
      matches: matchIds.map((matchId) => aFakeTrackerMatchSummaryWith({ matchId })),
      series: [aFakeTrackerSeriesGroupWith({ id: "s1", matchIds })],
    });
    const data = aFakeViewerSeriesDetailWith(matchIds, {
      matches: {
        matchIds,
        results: [anchor, tie, unmapped].map((detail) => ({ status: "resolved", matchId: detail.matchId, detail })),
      },
    });
    expect(presentOverview(view, data).matches.map((match) => match.teamColorHex)).toEqual([
      "#3B9DFF",
      undefined,
      undefined,
    ]);

    const unmatched = {
      ...view,
      series: view.series.map((series) => ({
        ...series,
        teams: [0, 1].map((id) => ({
          id,
          name: `Team ${id.toString()}`,
          players: [{ xboxId: `999999999${id.toString()}`, discordId: null, discordName: null, gamertag: null }],
        })),
      })),
    };
    expect(presentOverview(unmatched, data).matches.every((match) => match.teamColorHex === undefined)).toBe(true);
    const unavailable = aFakeViewerSeriesDetailWith(matchIds, {
      matches: {
        matchIds,
        results: [
          { status: "resolved", matchId: "m1", detail: anchor },
          { status: "resolved", matchId: "m2", detail: tie },
          { status: "unavailable", matchId: "m3", reason: "not-found" },
        ],
      },
    });
    expect(presentOverview(view, unavailable).matches[2]?.teamColorHex).toBeUndefined();
  });

  it.each([
    { mapping: "stable", configured: false, score: "50:40", subScore: "80:60", scenario: "no configured teams" },
    { mapping: "unmapped", configured: false, score: "40:50", subScore: "60:80", scenario: "unmapped sides" },
    {
      mapping: "stable",
      configured: true,
      score: "40:50",
      subScore: "60:80",
      scenario: "unmatched configured rosters",
    },
  ])("preserves score orientation with $scenario", ({ mapping, configured, score, subScore }) => {
    const series = {
      ...aFakeTrackerSeriesGroupWith({ id: "s1", matchIds: ["m1", "m2"] }),
      teams: configured
        ? [0, 1].map((id) => ({
            id,
            name: `Configured ${id.toString()}`,
            players: [{ discordId: null, discordName: null, gamertag: null, xboxId: `999999999${id.toString()}` }],
          }))
        : [],
    };
    const anchor = aFakeViewerSeriesMatchWith({ matchId: "m1" });
    const substitutedAndSwapped = aFakeViewerSeriesMatchWith({
      matchId: "m2",
      startTime: "2025-01-02T00:00:00.000Z",
      endTime: "2025-01-02T00:10:00.000Z",
      teams: [...anchor.teams].reverse().map((team) => ({
        ...team,
        matchTeamId: 1 - team.matchTeamId,
        seriesTeamId: mapping === "stable" ? team.matchTeamId : null,
        name: team.matchTeamId === 0 ? "Loaded Alpha" : "Loaded Beta",
      })),
      players: anchor.players.map((player) => ({
        ...player,
        playerId: player.playerId === "xuid(4444444444)" ? "xuid(5555555555)" : player.playerId,
        lastMatchTeamId: 1 - (player.lastMatchTeamId ?? 0),
        teamStats: player.teamStats.map((stats) => ({
          ...stats,
          matchTeamId: 1 - stats.matchTeamId,
          seriesTeamId: mapping === "stable" ? stats.seriesTeamId : null,
        })),
      })),
      score: {
        primary: {
          metric: "score",
          teams: [
            { matchTeamId: 0, seriesTeamId: mapping === "stable" ? 1 : null, value: 40 },
            { matchTeamId: 1, seriesTeamId: mapping === "stable" ? 0 : null, value: 50 },
          ],
        },
        secondary: {
          metric: "score",
          teams: [
            { matchTeamId: 0, seriesTeamId: mapping === "stable" ? 1 : null, value: 60 },
            { matchTeamId: 1, seriesTeamId: mapping === "stable" ? 0 : null, value: 80 },
          ],
        },
      },
    });
    const data = aFakeViewerSeriesDetailWith(["m1", "m2"], {
      matches: {
        matchIds: ["m1", "m2"],
        results: [anchor, substitutedAndSwapped].map((detail) => ({
          status: "resolved",
          matchId: detail.matchId,
          detail,
        })),
      },
    });
    const view = aFakeTrackerViewStateWith({
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m1" }), aFakeTrackerMatchSummaryWith({ matchId: "m2" })],
      series: [series],
    });
    const snapshot: IndividualTrackerViewerSnapshot = {
      status: ComponentLoaderStatus.LOADED,
      errorMessage: null,
      view,
      connectionStatus: "connected",
      refreshPending: false,
      expandedEntryKeys: new Set<string>(),
      entryStates: new Map([
        [
          "series:s1",
          { kind: "series", state: { status: "loaded", seriesId: "s1", data, analyticsByMatchId: new Map() } },
        ],
      ]),
      hasMore: false,
      loadingMore: false,
      loadMoreError: null,
    };

    const item = IndividualTrackerViewerPresenter.present(snapshot).renderModel?.timeline[0];

    if (item?.type !== "series") {
      throw new Error("Expected a series timeline item");
    }
    expect(item.series.seriesOverview.teams.map((team) => team.name)).toEqual(
      configured
        ? ["Configured 0", "Configured 1"]
        : mapping === "stable"
          ? ["Loaded Alpha", "Loaded Beta"]
          : ["Loaded Beta", "Loaded Alpha"],
    );
    expect(item.series.seriesOverview.matches[1]).toMatchObject({ score, subScore });
  });

  it.each([null, "data:,"])(
    "retains loaded scores, teams and rich thumbnails when detail thumbnail is %s",
    (thumbnailUrl) => {
      const series = aFakeTrackerSeriesGroupWith({ id: "s1", matchIds: ["m1", "m2"] });
      const view = aFakeTrackerViewStateWith({
        matches: [
          aFakeTrackerMatchSummaryWith({
            matchId: "m1",
            outcome: "Loss",
            score: "Tracked-player order 0:1",
            mapBackgroundUrl: "data:,",
          }),
          aFakeTrackerMatchSummaryWith({
            matchId: "m2",
            outcome: "Win",
            score: "Tracked-player order 1:0",
            mapBackgroundUrl: "https://cached.test/map-two.jpg",
          }),
        ],
        series: [{ ...series, teams: [] }],
      });
      const first = aFakeViewerSeriesMatchWith({ matchId: "m1" });
      const data = aFakeViewerSeriesDetailWith(["m1", "m2"], {
        matches: {
          matchIds: ["m1", "m2"],
          results: [
            {
              status: "resolved",
              matchId: "m1",
              detail: {
                ...first,
                map: { ...first.map, thumbnailUrl: "https://cdn.test/map-one.jpg" },
              },
            },
            {
              status: "resolved",
              matchId: "m2",
              detail: aFakeViewerSeriesMatchWith({
                matchId: "m2",
                map: { ...first.map, thumbnailUrl },
                endTime: "2025-01-01T00:00:00.000Z",
                teams: first.teams.map((team) => ({
                  ...team,
                  name: team.matchTeamId === 0 ? "Loaded Eagle" : "Loaded Cobra",
                })),
                score: {
                  primary: {
                    metric: "score",
                    teams: [
                      { matchTeamId: 0, seriesTeamId: 0, value: 0 },
                      { matchTeamId: 1, seriesTeamId: 1, value: 1 },
                    ],
                  },
                  secondary: null,
                },
              }),
            },
          ],
        },
      });
      const entryStates = new Map<string, ViewerEntryState>([
        [
          "series:s1",
          { kind: "series", state: { status: "loaded", seriesId: "s1", data, analyticsByMatchId: new Map() } },
        ],
      ]);
      const snapshot: IndividualTrackerViewerSnapshot = {
        status: ComponentLoaderStatus.LOADED,
        errorMessage: null,
        view,
        connectionStatus: "connected",
        refreshPending: false,
        expandedEntryKeys: new Set<string>(),
        entryStates,
        hasMore: false,
        loadingMore: false,
        loadMoreError: null,
      };

      const model = IndividualTrackerViewerPresenter.present(snapshot);
      const item = model.renderModel?.timeline[0];

      if (item?.type !== "series") {
        throw new Error("Expected a series timeline item");
      }

      expect(item.series.seriesOverview.teams.map((team) => team.name)).toEqual(["Loaded Eagle", "Loaded Cobra"]);
      expect(item.series.seriesOverview.matches.map((match) => [match.id, match.score, match.subScore])).toEqual([
        ["m1", "50:40", "80:60"],
        ["m2", "0:1", null],
      ]);
      expect(item.series.seriesOverview.matches[0]?.href).toBe("#m1");
      expect(item.series.seriesOverview.matches[1]?.href).toBe("#m2");
      expect(item.series.seriesOverview.matches.map((match) => [match.id, match.mapBackgroundUrl])).toEqual([
        ["m1", "https://cdn.test/map-one.jpg"],
        ["m2", "https://cached.test/map-two.jpg"],
      ]);
    },
  );
});
