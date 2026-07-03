import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { SeriesMatchesResponse } from "@guilty-spark/shared/contracts/stats/series-matches";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { aFakeMatchStatsWith } from "../../../../controllers/stats/fakes/data";
import { ComponentLoaderStatus } from "../../../component-loader/component-loader";
import { aFakeIndividualTrackerServiceWith } from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import {
  aFakeIndividualTrackerViewServiceWith,
  aFakeTrackerLiveViewWith,
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerSeriesGroupWith,
  aFakeTrackerViewStateWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import { aFakeHaloClientWith } from "../../../../services/fakes/halo-client.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../../services/stats/fakes/match-analytics.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../../services/stats/fakes/series-matches.fake";
import type { MatchAnalyticsService } from "../../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../../services/stats/series-matches-types";
import { useIndividualTrackerViewer } from "../use-individual-tracker-viewer";

interface ViewerTestDependencies {
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
}

function aViewerTestDependenciesWith(): ViewerTestDependencies {
  return {
    matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    seriesMatchesService: aFakeSeriesMatchesServiceWith(),
    haloClient: aFakeHaloClientWith(),
  };
}

describe("useIndividualTrackerViewer", () => {
  it("does not recreate presenter when streamer settings values are unchanged", async () => {
    const individualTrackerService = aFakeIndividualTrackerServiceWith();
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({ trackerId: "tracker-1", status: "active" }),
    });
    const connectSpy = vi.spyOn(individualTrackerViewService, "connect");
    const { matchAnalyticsService, seriesMatchesService, haloClient } = aViewerTestDependenciesWith();

    const initialSettings: StreamerViewSettings = {
      styleFlags: {
        matchmakingMyStatsOnly: true,
      },
    };

    const { rerender } = renderHook(
      ({ settings }: { settings: StreamerViewSettings }) =>
        useIndividualTrackerViewer({
          individualTrackerService,
          individualTrackerViewService,
          matchAnalyticsService,
          seriesMatchesService,
          haloClient,
          trackerId: "tracker-1",
          streamerSettings: settings,
        }),
      {
        initialProps: { settings: initialSettings },
      },
    );

    await waitFor(() => {
      expect(connectSpy).toHaveBeenCalledTimes(1);
    });

    const nextSettings: StreamerViewSettings = {
      styleFlags: {
        matchmakingMyStatsOnly: true,
      },
    };

    await act(async () => {
      rerender({ settings: nextSettings });
      await Promise.resolve();
    });

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it("clears refreshPending after the websocket view update arrives", async () => {
    const individualTrackerService = aFakeIndividualTrackerServiceWith();
    const refreshSpy = vi.spyOn(individualTrackerService, "refreshTracker").mockResolvedValue(undefined);
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({ trackerId: "tracker-1", status: "active" }),
    });
    const { matchAnalyticsService, seriesMatchesService, haloClient } = aViewerTestDependenciesWith();

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerService,
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        haloClient,
        trackerId: "tracker-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
      expect(individualTrackerViewService.lastConnection).not.toBeNull();
    });

    act(() => {
      result.current.onRefresh();
    });

    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledWith("tracker-1");
      expect(result.current.snapshot.refreshPending).toBe(true);
    });

    act(() => {
      individualTrackerViewService.lastConnection?.emitView(
        aFakeTrackerLiveViewWith({ trackerId: "tracker-1", status: "active" }),
      );
    });

    await waitFor(() => {
      expect(result.current.snapshot.refreshPending).toBe(false);
    });
  });

  it("does not prefetch timeline entries on initial load", async () => {
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({ trackerId: "tracker-1", status: "active" }),
    });
    const { matchAnalyticsService, seriesMatchesService, haloClient } = aViewerTestDependenciesWith();
    const getSeriesMatchesSpy = vi.spyOn(seriesMatchesService, "getSeriesMatches");
    const getMatchStatsSpy = vi.spyOn(haloClient, "getMatchStats");

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        haloClient,
        trackerId: "tracker-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    });

    expect(getSeriesMatchesSpy).not.toHaveBeenCalled();
    expect(getMatchStatsSpy).not.toHaveBeenCalled();
  });

  it("treats the public viewer path as connected after the initial view loads", async () => {
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({ trackerId: "tracker-1", status: "active" }),
    });
    const connectSpy = vi.spyOn(individualTrackerViewService, "connect");
    const { matchAnalyticsService, seriesMatchesService, haloClient } = aViewerTestDependenciesWith();

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        haloClient,
        trackerId: "tracker-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
      expect(result.current.snapshot.connectionStatus).toBe("connected");
    });

    expect(connectSpy).not.toHaveBeenCalled();
  });

  it("loads long series in a single request when a series entry expands", async () => {
    const matchIds = Array.from({ length: 13 }, (_, index) => `m-${(index + 1).toString()}`);
    const matches = matchIds.map((matchId) => aFakeTrackerMatchSummaryWith({ matchId }));
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({
        trackerId: "tracker-1",
        status: "active",
        matches,
        series: [aFakeTrackerSeriesGroupWith({ id: "series-1", title: "Long Series", matchIds })],
      }),
    });
    const { matchAnalyticsService, seriesMatchesService, haloClient } = aViewerTestDependenciesWith();
    const getSeriesMatchesSpy = vi.spyOn(seriesMatchesService, "getSeriesMatches").mockImplementation(async (ids) =>
      Promise.resolve({
        medalMetadata: {},
        playerXuidToGametag: {},
        matches: ids.map((matchId) => ({
          matchId,
          gameTypeAndMap: "Slayer: Live Fire",
          gameVariantCategory: 0,
          gameType: "Slayer",
          gameMap: "Live Fire",
          gameMapThumbnailUrl: "data:",
          duration: "10m 00s",
          gameScore: "50:45",
          gameSubScore: null,
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:10:00.000Z",
          rawMatch: {},
        })),
      }),
    );

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        haloClient,
        trackerId: "tracker-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    });

    const seriesItem = result.current.model.renderModel?.timeline.find((item) => item.type === "series");
    expect(seriesItem?.type).toBe("series");

    act(() => {
      if (seriesItem?.type === "series") {
        result.current.onToggleEntry(seriesItem);
      }
    });

    await waitFor(() => {
      expect(getSeriesMatchesSpy).toHaveBeenCalledTimes(1);
    });

    expect(getSeriesMatchesSpy).toHaveBeenCalledWith(matchIds);

    const state = result.current.snapshot.entryStates.get("series:series-1");
    expect(state?.kind).toBe("series");
    if (state?.kind === "series" && state.state.status === "loaded") {
      expect(state.state.viewModel.seriesStats?.killMatrixStatus).toBe(ComponentLoaderStatus.LOADED);
      expect(state.state.viewModel.matchDetails[0]?.killMatrixStatus).toBe(ComponentLoaderStatus.LOADED);
    }
  });

  it("retries a series load after an error when the entry is collapsed and re-expanded", async () => {
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({
        trackerId: "tracker-1",
        status: "active",
        matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" }), aFakeTrackerMatchSummaryWith({ matchId: "m-2" })],
        series: [aFakeTrackerSeriesGroupWith({ id: "series-1", title: "Retry Series", matchIds: ["m-1", "m-2"] })],
      }),
    });
    const { matchAnalyticsService, seriesMatchesService, haloClient } = aViewerTestDependenciesWith();
    const getSeriesMatchesSpy = vi
      .spyOn(seriesMatchesService, "getSeriesMatches")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({
        medalMetadata: {},
        playerXuidToGametag: {},
        matches: ["m-1", "m-2"].map((matchId) => ({
          matchId,
          gameTypeAndMap: "Slayer: Live Fire",
          gameVariantCategory: 0,
          gameType: "Slayer",
          gameMap: "Live Fire",
          gameMapThumbnailUrl: "data:",
          duration: "10m 00s",
          gameScore: "50:45",
          gameSubScore: null,
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:10:00.000Z",
          rawMatch: {},
        })),
      });

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        haloClient,
        trackerId: "tracker-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    });

    const seriesItem = result.current.model.renderModel?.timeline.find((item) => item.type === "series");
    expect(seriesItem?.type).toBe("series");

    act(() => {
      if (seriesItem?.type === "series") {
        result.current.onToggleEntry(seriesItem);
      }
    });

    await waitFor(() => {
      const state = result.current.snapshot.entryStates.get("series:series-1");
      expect(state?.kind).toBe("series");
      expect(state?.state.status).toBe("error");
    });

    act(() => {
      if (seriesItem?.type === "series") {
        result.current.onToggleEntry(seriesItem);
        result.current.onToggleEntry(seriesItem);
      }
    });

    await waitFor(() => {
      expect(getSeriesMatchesSpy).toHaveBeenCalledTimes(2);
    });
  });

  it("chunks very large series requests to stay within the API matchId limit", async () => {
    const matchIds = Array.from({ length: 61 }, (_, index) => `m-${(index + 1).toString()}`);
    const matches = matchIds.map((matchId) => aFakeTrackerMatchSummaryWith({ matchId }));
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({
        trackerId: "tracker-1",
        status: "active",
        matches,
        series: [aFakeTrackerSeriesGroupWith({ id: "series-1", title: "Huge Series", matchIds })],
      }),
    });
    const { matchAnalyticsService, seriesMatchesService, haloClient } = aViewerTestDependenciesWith();
    const getSeriesMatchesSpy = vi.spyOn(seriesMatchesService, "getSeriesMatches").mockImplementation(async (ids) =>
      Promise.resolve({
        medalMetadata: {},
        playerXuidToGametag: {},
        matches: ids.map((matchId) => ({
          matchId,
          gameTypeAndMap: "Slayer: Live Fire",
          gameVariantCategory: 0,
          gameType: "Slayer",
          gameMap: "Live Fire",
          gameMapThumbnailUrl: "data:",
          duration: "10m 00s",
          gameScore: "50:45",
          gameSubScore: null,
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:10:00.000Z",
          rawMatch: {},
        })),
      }),
    );

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        haloClient,
        trackerId: "tracker-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    });

    const seriesItem = result.current.model.renderModel?.timeline.find((item) => item.type === "series");
    expect(seriesItem?.type).toBe("series");

    act(() => {
      if (seriesItem?.type === "series") {
        result.current.onToggleEntry(seriesItem);
      }
    });

    await waitFor(() => {
      expect(getSeriesMatchesSpy).toHaveBeenCalledTimes(3);
    });

    expect(getSeriesMatchesSpy).toHaveBeenNthCalledWith(1, matchIds.slice(0, 30));
    expect(getSeriesMatchesSpy).toHaveBeenNthCalledWith(2, matchIds.slice(30, 60));
    expect(getSeriesMatchesSpy).toHaveBeenNthCalledWith(3, matchIds.slice(60, 61));
  });

  it("uses the latest chronological match for series team cards", async () => {
    const matchIds = ["m-1", "m-2"];
    const matches = matchIds.map((matchId) => aFakeTrackerMatchSummaryWith({ matchId }));
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({
        trackerId: "tracker-1",
        status: "active",
        matches,
        series: [aFakeTrackerSeriesGroupWith({ id: "series-1", title: "Roster Source", matchIds })],
      }),
    });
    const { matchAnalyticsService, seriesMatchesService, haloClient } = aViewerTestDependenciesWith();
    const matchA = aFakeMatchStatsWith({
      MatchId: "m-1",
      MatchInfo: {
        ...aFakeMatchStatsWith().MatchInfo,
        StartTime: "2026-01-01T00:00:00.000Z",
        EndTime: "2026-01-01T00:10:00.000Z",
      },
      Teams: [
        { ...aFakeMatchStatsWith().Teams[0], TeamId: 0 },
        { ...aFakeMatchStatsWith().Teams[1], TeamId: 1 },
      ],
    });
    const matchB = aFakeMatchStatsWith({
      MatchId: "m-2",
      MatchInfo: {
        ...aFakeMatchStatsWith().MatchInfo,
        StartTime: "2026-01-01T00:20:00.000Z",
        EndTime: "2026-01-01T00:30:00.000Z",
      },
      Teams: [
        { ...aFakeMatchStatsWith().Teams[0], TeamId: 4 },
        { ...aFakeMatchStatsWith().Teams[1], TeamId: 5 },
      ],
    });

    vi.spyOn(seriesMatchesService, "getSeriesMatches").mockResolvedValue({
      medalMetadata: {},
      playerXuidToGametag: {},
      matches: [
        {
          matchId: "m-1",
          gameTypeAndMap: "Slayer: Live Fire",
          gameVariantCategory: 0,
          gameType: "Slayer",
          gameMap: "Live Fire",
          gameMapThumbnailUrl: "data:",
          duration: "10m 00s",
          gameScore: "50:45",
          gameSubScore: null,
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:10:00.000Z",
          rawMatch: matchA,
        },
        {
          matchId: "m-2",
          gameTypeAndMap: "Slayer: Aquarius",
          gameVariantCategory: 0,
          gameType: "Slayer",
          gameMap: "Aquarius",
          gameMapThumbnailUrl: "data:",
          duration: "10m 00s",
          gameScore: "50:45",
          gameSubScore: null,
          startTime: "2026-01-01T00:20:00.000Z",
          endTime: "2026-01-01T00:30:00.000Z",
          rawMatch: matchB,
        },
      ],
    });

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        haloClient,
        trackerId: "tracker-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    });

    const seriesItem = result.current.model.renderModel?.timeline.find((item) => item.type === "series");
    expect(seriesItem?.type).toBe("series");

    act(() => {
      if (seriesItem?.type === "series") {
        result.current.onToggleEntry(seriesItem);
      }
    });

    await waitFor(() => {
      const state = result.current.snapshot.entryStates.get("series:series-1");
      expect(state?.kind).toBe("series");
      if (state?.kind === "series" && state.state.status === "loaded") {
        expect(state.state.viewModel.teams[0]?.name).toBe("Rampart");
      }
    });
  });

  it("stops requesting additional series batches after dispose", async () => {
    const matchIds = Array.from({ length: 61 }, (_, index) => `m-${(index + 1).toString()}`);
    const matches = matchIds.map((matchId) => aFakeTrackerMatchSummaryWith({ matchId }));
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({
        trackerId: "tracker-1",
        status: "active",
        matches,
        series: [aFakeTrackerSeriesGroupWith({ id: "series-1", title: "Huge Series", matchIds })],
      }),
    });
    const { matchAnalyticsService, seriesMatchesService, haloClient } = aViewerTestDependenciesWith();
    let resolveFirstBatch: ((value: SeriesMatchesResponse) => void) | undefined;
    const firstBatchPromise = new Promise<SeriesMatchesResponse>((resolve) => {
      resolveFirstBatch = resolve;
    });
    const getSeriesMatchesSpy = vi
      .spyOn(seriesMatchesService, "getSeriesMatches")
      .mockImplementationOnce(async () => firstBatchPromise)
      .mockImplementation(async () => Promise.reject(new Error("Subsequent batch should not run after dispose")));

    const { result, unmount } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        haloClient,
        trackerId: "tracker-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    });

    const seriesItem = result.current.model.renderModel?.timeline.find((item) => item.type === "series");
    expect(seriesItem?.type).toBe("series");

    act(() => {
      if (seriesItem?.type === "series") {
        result.current.onToggleEntry(seriesItem);
      }
    });

    await waitFor(() => {
      expect(getSeriesMatchesSpy).toHaveBeenCalledTimes(1);
    });

    unmount();

    expect(resolveFirstBatch).toBeDefined();
    resolveFirstBatch?.({
      medalMetadata: {},
      playerXuidToGametag: {},
      matches: matchIds.slice(0, 30).map((matchId) => ({
        matchId,
        gameTypeAndMap: "Slayer: Live Fire",
        gameVariantCategory: 0,
        gameType: "Slayer",
        gameMap: "Live Fire",
        gameMapThumbnailUrl: "data:",
        duration: "10m 00s",
        gameScore: "50:45",
        gameSubScore: null,
        startTime: "2026-01-01T00:00:00.000Z",
        endTime: "2026-01-01T00:10:00.000Z",
        rawMatch: {},
      })),
    });

    await waitFor(() => {
      expect(getSeriesMatchesSpy).toHaveBeenCalledTimes(1);
    });
  });
});
