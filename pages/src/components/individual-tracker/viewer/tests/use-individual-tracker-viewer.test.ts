import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { ComponentLoaderStatus } from "../../../component-loader/component-loader";
import { aFakeIndividualTrackerServiceWith } from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import {
  aFakeIndividualTrackerViewServiceWith,
  aFakeTrackerLiveViewWith,
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerSeriesGroupWith,
  aFakeTrackerViewStateWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import type { MatchAnalyticsService } from "../../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../../services/stats/series-matches-types";
import { useIndividualTrackerViewer } from "../use-individual-tracker-viewer";

describe("useIndividualTrackerViewer", () => {
  it("clears refreshPending after the websocket view update arrives", async () => {
    const individualTrackerService = aFakeIndividualTrackerServiceWith();
    const refreshSpy = vi.spyOn(individualTrackerService, "refreshTracker").mockResolvedValue(undefined);
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({ trackerId: "tracker-1", status: "active" }),
    });
    const matchAnalyticsService = {
      getBatchMatchAnalytics: vi.fn().mockResolvedValue({}),
    } as unknown as MatchAnalyticsService;
    const seriesMatchesService = {
      getSeriesMatches: vi.fn(),
    } as unknown as SeriesMatchesService;
    const haloClient = {} as HaloInfiniteClient;

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
    const matchAnalyticsService = {
      getBatchMatchAnalytics: vi.fn().mockResolvedValue({}),
    } as unknown as MatchAnalyticsService;
    const getSeriesMatches = vi.fn();
    const seriesMatchesService = {
      getSeriesMatches,
    } as unknown as SeriesMatchesService;
    const getMatchStats = vi.fn();
    const haloClient = {
      getMatchStats,
    } as unknown as HaloInfiniteClient;

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

    expect(getSeriesMatches).not.toHaveBeenCalled();
    expect(getMatchStats).not.toHaveBeenCalled();
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
    const matchAnalyticsService = {
      getBatchMatchAnalytics: vi.fn().mockResolvedValue({}),
    } as unknown as MatchAnalyticsService;
    const getSeriesMatches = vi.fn<SeriesMatchesService["getSeriesMatches"]>().mockImplementation(async (ids) =>
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
    const seriesMatchesService = {
      getSeriesMatches,
    } as unknown as SeriesMatchesService;
    const haloClient = {} as HaloInfiniteClient;

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
      expect(getSeriesMatches).toHaveBeenCalledTimes(1);
    });

    expect(getSeriesMatches).toHaveBeenCalledWith(matchIds);
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
    const matchAnalyticsService = {
      getBatchMatchAnalytics: vi.fn().mockResolvedValue({}),
    } as unknown as MatchAnalyticsService;
    const getSeriesMatches = vi
      .fn<SeriesMatchesService["getSeriesMatches"]>()
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
    const seriesMatchesService = {
      getSeriesMatches,
    } as unknown as SeriesMatchesService;
    const haloClient = {} as HaloInfiniteClient;

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
      expect(getSeriesMatches).toHaveBeenCalledTimes(2);
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
    const matchAnalyticsService = {
      getBatchMatchAnalytics: vi.fn().mockResolvedValue({}),
    } as unknown as MatchAnalyticsService;
    const getSeriesMatches = vi.fn<SeriesMatchesService["getSeriesMatches"]>().mockImplementation(async (ids) =>
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
    const seriesMatchesService = {
      getSeriesMatches,
    } as unknown as SeriesMatchesService;
    const haloClient = {} as HaloInfiniteClient;

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
      expect(getSeriesMatches).toHaveBeenCalledTimes(3);
    });

    expect(getSeriesMatches).toHaveBeenNthCalledWith(1, matchIds.slice(0, 30));
    expect(getSeriesMatches).toHaveBeenNthCalledWith(2, matchIds.slice(30, 60));
    expect(getSeriesMatches).toHaveBeenNthCalledWith(3, matchIds.slice(60, 61));
  });
});
