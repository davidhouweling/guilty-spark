import { describe, expect, it } from "vitest";
import { ComponentLoaderStatus } from "../../../component-loader/component-loader";
import type { IndividualTrackerViewerSnapshot } from "../viewer-store";
import { IndividualTrackerViewerPresenter } from "../viewer-presenter";
import {
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerSeriesGroupWith,
  aFakeTrackerViewStateWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import type { ViewerEntryState } from "../types";
import { aFakeViewerSeriesDetailWith, aFakeViewerSeriesMatchWith } from "../fakes/series-detail.fake";

describe("IndividualTrackerViewerPresenter", () => {
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
