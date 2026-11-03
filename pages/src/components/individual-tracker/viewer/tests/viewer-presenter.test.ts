import { describe, expect, it } from "vitest";
import { ComponentLoaderStatus } from "../../../component-loader/component-loader";
import type { IndividualTrackerViewerSnapshot } from "../viewer-store";
import { IndividualTrackerViewerPresenter } from "../viewer-presenter";
import type { SeriesStatsViewModel } from "../../../series-stats/types";
import {
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerSeriesGroupWith,
  aFakeTrackerViewStateWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import type { ViewerEntryState } from "../types";

describe("IndividualTrackerViewerPresenter", () => {
  it("uses loaded team cards and roster-aligned match scores after a team side swap", () => {
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
    const viewModel: SeriesStatsViewModel = {
      title: "Series",
      subtitle: "Best of 3",
      seriesScore: "1:1",
      matchSummaries: [
        {
          matchId: "m2",
          gameMapThumbnailUrl: "data:,",
          gameModeIconUrl: "data:,",
          gameModeAlt: "Slayer",
          gameScore: "Roster order 0:1",
          gameSubScore: "side swap",
          gameMap: "Map Two",
          winningTeamColorHex: null,
        },
        {
          matchId: "m1",
          gameMapThumbnailUrl: "https://cdn.test/map-one.jpg",
          gameModeIconUrl: "data:,",
          gameModeAlt: "Oddball",
          gameScore: "Roster order 1:0",
          gameSubScore: null,
          gameMap: "Map One",
          winningTeamColorHex: null,
        },
      ],
      teams: [
        { name: "Loaded Eagle", players: ["Eagle Player"], teamColorHex: "#111111" },
        { name: "Loaded Cobra", players: ["Cobra Player"], teamColorHex: "#222222" },
      ],
      seriesStats: null,
      matchDetails: [],
    };
    const entryStates = new Map<string, ViewerEntryState>([
      ["series:s1", { kind: "series", state: { status: "loaded", seriesId: "s1", viewModel } }],
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
      ["m1", "Roster order 1:0", null],
      ["m2", "Roster order 0:1", "side swap"],
    ]);
    expect(item.series.seriesOverview.matches[0]?.href).toBe("#m1");
    expect(item.series.seriesOverview.matches[1]?.href).toBe("#m2");
    expect(item.series.seriesOverview.matches.map((match) => [match.id, match.mapBackgroundUrl])).toEqual([
      ["m1", "https://cdn.test/map-one.jpg"],
      ["m2", "https://cached.test/map-two.jpg"],
    ]);
  });
});
