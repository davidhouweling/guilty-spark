import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { aFakeMatchAnalyticsWith } from "../../../../controllers/stats/kill-matrix/fakes/match-analytics.fake";
import { ComponentLoaderStatus } from "../../../component-loader/component-loader";
import { aFakeIndividualTrackerServiceWith } from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import { HaloMedalMetadataResolver } from "../../../../services/halo/medal-metadata-resolver";
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
import { aFakeMatchDetailsServiceWith } from "../../../../services/stats/fakes/match-details.fake";
import { aFakeSeriesDetailServiceWith } from "../../../../services/stats/fakes/series-detail.fake";
import type { MatchAnalyticsService } from "../../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../../services/stats/series-matches-types";
import * as reconnectPolicy from "../../../../services/base/reconnect-policy";
import { useIndividualTrackerViewer } from "../use-individual-tracker-viewer";
import { aFakeViewerSeriesDetailWith, aFakeViewerSeriesMatchWith } from "../fakes/series-detail.fake";

interface ViewerTestDependencies {
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
}

function aViewerTestDependenciesWith(): ViewerTestDependencies {
  const haloClient = aFakeHaloClientWith();

  return {
    matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    seriesMatchesService: aFakeSeriesMatchesServiceWith(),
    haloClient,
    medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
  };
}

describe("useIndividualTrackerViewer", () => {
  it("does not recreate presenter when streamer settings values are unchanged", async () => {
    const individualTrackerService = aFakeIndividualTrackerServiceWith();
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({ trackerId: "tracker-1", status: "active" }),
    });
    const connectSpy = vi.spyOn(individualTrackerViewService, "connect");
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();

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
          medalMetadataResolver,
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
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerService,
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        medalMetadataResolver,
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
    const { matchAnalyticsService, seriesMatchesService, haloClient, medalMetadataResolver } =
      aViewerTestDependenciesWith();
    const getSeriesMatchesSpy = vi.spyOn(seriesMatchesService, "getSeriesMatches");
    const getMatchStatsSpy = vi.spyOn(haloClient, "getMatchStats");

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        medalMetadataResolver,
        trackerId: "tracker-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    });

    expect(getSeriesMatchesSpy).not.toHaveBeenCalled();
    expect(getMatchStatsSpy).not.toHaveBeenCalled();
  });

  it("loads match analytics when an expanded match analytics tab is selected", async () => {
    const matchId = "match-1";
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({
        trackerId: "tracker-1",
        status: "active",
        matches: [aFakeTrackerMatchSummaryWith({ matchId })],
      }),
    });
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();
    const matchDetailsService = aFakeMatchDetailsServiceWith();
    const detailSpy = vi.spyOn(matchDetailsService, "getMatchDetails");
    const legacySpy = vi.spyOn(seriesMatchesService, "getSeriesMatches");

    let resolveAnalytics: ((value: Record<string, MatchAnalytics | null>) => void) | undefined;
    const analyticsPromise = new Promise<Record<string, MatchAnalytics | null>>((resolve) => {
      resolveAnalytics = resolve;
    });
    const getBatchMatchAnalyticsSpy = vi
      .spyOn(matchAnalyticsService, "getBatchMatchAnalytics")
      .mockImplementation(async () => analyticsPromise);

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchDetailsService,
        matchAnalyticsService,
        seriesMatchesService,
        medalMetadataResolver,
        trackerId: "tracker-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    });

    const matchItem = result.current.model.renderModel?.timeline.find((item) => item.type === "match");
    expect(detailSpy).not.toHaveBeenCalled();
    expect(matchItem?.type).toBe("match");

    act(() => {
      if (matchItem?.type === "match") {
        result.current.onToggleEntry(matchItem);
      }
    });

    await waitFor(() => {
      const state = result.current.snapshot.entryStates.get(`match:${matchId}`);
      expect(state?.kind).toBe("match");
      expect(state?.kind === "match" ? state.state.status : undefined).toBe("loaded");
      if (state?.kind === "match" && state.state.status === "loaded") {
        expect(state.state.killMatrixStatus).toBe(ComponentLoaderStatus.PENDING);
      }
    });
    expect(detailSpy).toHaveBeenCalledExactlyOnceWith([matchId], "tracker-1");
    expect(legacySpy).not.toHaveBeenCalled();

    act(() => {
      if (matchItem?.type === "match") {
        result.current.onLoadAnalytics(matchItem, "killMatrix");
      }
    });

    await waitFor(() => {
      expect(getBatchMatchAnalyticsSpy).toHaveBeenCalledWith([matchId], ["killMatrix"], "tracker-1");
      const state = result.current.snapshot.entryStates.get(`match:${matchId}`);
      expect(state?.kind).toBe("match");
      if (state?.kind === "match" && state.state.status === "loaded") {
        expect(state.state.killMatrixStatus).toBe(ComponentLoaderStatus.LOADING);
      }
    });

    resolveAnalytics?.({ [matchId]: aFakeMatchAnalyticsWith({ requestedModules: ["killMatrix"], killMatrix: {} }) });

    await waitFor(() => {
      const state = result.current.snapshot.entryStates.get(`match:${matchId}`);
      expect(state?.kind).toBe("match");
      if (state?.kind === "match" && state.state.status === "loaded") {
        expect(state.state.killMatrixStatus).toBe(ComponentLoaderStatus.LOADED);
      }
    });
  });

  it("preserves score progression when overlapping kill matrix request resolves last", async () => {
    const matchId = "match-1";
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({
        trackerId: "tracker-1",
        status: "active",
        matches: [aFakeTrackerMatchSummaryWith({ matchId })],
      }),
    });
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();
    const matchDetailsService = aFakeMatchDetailsServiceWith();

    let resolveKillMatrix: ((value: Record<string, MatchAnalytics | null>) => void) | undefined;
    let resolveScoreProgression: ((value: Record<string, MatchAnalytics | null>) => void) | undefined;
    const killMatrixPromise = new Promise<Record<string, MatchAnalytics | null>>((resolve) => {
      resolveKillMatrix = resolve;
    });
    const scoreProgressionPromise = new Promise<Record<string, MatchAnalytics | null>>((resolve) => {
      resolveScoreProgression = resolve;
    });
    const getBatchMatchAnalyticsSpy = vi
      .spyOn(matchAnalyticsService, "getBatchMatchAnalytics")
      .mockImplementation(async (_matchIds, modules) => {
        return modules?.includes("scoreProgression") === true ? scoreProgressionPromise : killMatrixPromise;
      });

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchDetailsService,
        matchAnalyticsService,
        seriesMatchesService,
        medalMetadataResolver,
        trackerId: "tracker-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    });

    const matchItem = result.current.model.renderModel?.timeline.find((item) => item.type === "match");
    expect(matchItem?.type).toBe("match");

    act(() => {
      if (matchItem?.type === "match") {
        result.current.onToggleEntry(matchItem);
      }
    });

    await waitFor(() => {
      const state = result.current.snapshot.entryStates.get(`match:${matchId}`);
      expect(state?.kind).toBe("match");
      expect(state?.kind === "match" ? state.state.status : undefined).toBe("loaded");
    });

    act(() => {
      if (matchItem?.type === "match") {
        result.current.onLoadAnalytics(matchItem, "killMatrix");
        result.current.onLoadAnalytics(matchItem, "scoreProgression");
      }
    });

    await waitFor(() => {
      expect(getBatchMatchAnalyticsSpy).toHaveBeenCalledWith([matchId], ["killMatrix"], "tracker-1");
      expect(getBatchMatchAnalyticsSpy).toHaveBeenCalledWith([matchId], ["scoreProgression"], "tracker-1");
    });

    resolveScoreProgression?.({
      [matchId]: aFakeMatchAnalyticsWith({
        requestedModules: ["scoreProgression", "killMatrix"],
        scoreProgression: {
          mode: 1,
          durationMs: 600_000,
          teamCount: 2,
          timeline: {
            type: "kill-race",
            events: [{ timestampMs: 1_000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
            deathTimeline: [],
            respawnDurationMs: null,
          },
        },
      }),
    });

    await waitFor(() => {
      const state = result.current.snapshot.entryStates.get(`match:${matchId}`);
      expect(state?.kind).toBe("match");
      if (state?.kind === "match" && state.state.status === "loaded") {
        expect(state.state.scoreProgressionStatus).toBe(ComponentLoaderStatus.LOADED);
        expect(state.state.scoreProgressionViewData).not.toBeNull();
      }
    });

    resolveKillMatrix?.({
      [matchId]: aFakeMatchAnalyticsWith({ requestedModules: ["killMatrix"], scoreProgression: null }),
    });

    await waitFor(() => {
      const state = result.current.snapshot.entryStates.get(`match:${matchId}`);
      expect(state?.kind).toBe("match");
      if (state?.kind === "match" && state.state.status === "loaded") {
        expect(state.state.killMatrixStatus).toBe(ComponentLoaderStatus.LOADED);
        expect(state.state.scoreProgressionStatus).toBe(ComponentLoaderStatus.LOADED);
        expect(state.state.scoreProgressionViewData).not.toBeNull();
      }
    });
  });

  it("connects the public viewer path after the initial view loads", async () => {
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({ trackerId: "tracker-1", status: "active" }),
    });
    const connectSpy = vi.spyOn(individualTrackerViewService, "connect");
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        medalMetadataResolver,
        trackerId: "tracker-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    });

    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps loaded view visible when connection status degrades", async () => {
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({ trackerId: "tracker-1", status: "active" }),
    });
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        medalMetadataResolver,
        trackerId: "tracker-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
      expect(result.current.model.renderModel).not.toBeNull();
      expect(individualTrackerViewService.lastConnection).not.toBeNull();
    });

    act(() => {
      individualTrackerViewService.lastConnection?.emitStatus("error", "Connection lost");
    });

    expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    expect(result.current.model.renderModel).not.toBeNull();
    expect(result.current.model.connectionStatus).toBe("error");
  });

  it("reconnects automatically after connection error", async () => {
    const reconnectDelaySpy = vi.spyOn(reconnectPolicy, "getReconnectDelayMs").mockReturnValue(1);

    try {
      const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
        view: aFakeTrackerViewStateWith({ trackerId: "tracker-1", status: "active" }),
      });
      const connectSpy = vi.spyOn(individualTrackerViewService, "connect");
      const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();

      const { result } = renderHook(() =>
        useIndividualTrackerViewer({
          individualTrackerViewService,
          matchAnalyticsService,
          seriesMatchesService,
          medalMetadataResolver,
          trackerId: "tracker-1",
        }),
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);

      expect(connectSpy).toHaveBeenCalledTimes(1);

      act(() => {
        individualTrackerViewService.lastConnection?.emitStatus("error", "Connection lost");
      });

      await waitFor(() => {
        expect(connectSpy).toHaveBeenCalledTimes(2);
      });
    } finally {
      reconnectDelaySpy.mockRestore();
    }
  });

  it("preserves reconnect backoff across reconnecting status transitions", async () => {
    const reconnectDelaySpy = vi.spyOn(reconnectPolicy, "getReconnectDelayMs").mockReturnValue(1);

    try {
      const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
        view: aFakeTrackerViewStateWith({ trackerId: "tracker-1", status: "active" }),
      });
      const connectSpy = vi.spyOn(individualTrackerViewService, "connect");
      const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();

      const { result } = renderHook(() =>
        useIndividualTrackerViewer({
          individualTrackerViewService,
          matchAnalyticsService,
          seriesMatchesService,
          medalMetadataResolver,
          trackerId: "tracker-1",
        }),
      );

      await waitFor(() => {
        expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
      });

      expect(connectSpy).toHaveBeenCalledTimes(1);

      act(() => {
        individualTrackerViewService.lastConnection?.emitStatus("error", "Connection lost");
      });

      await waitFor(() => {
        expect(connectSpy).toHaveBeenCalledTimes(2);
      });

      act(() => {
        individualTrackerViewService.lastConnection?.emitStatus("connecting");
      });

      act(() => {
        individualTrackerViewService.lastConnection?.emitStatus("error", "Connection lost again");
      });

      await waitFor(() => {
        expect(connectSpy).toHaveBeenCalledTimes(3);
      });

      expect(reconnectDelaySpy).toHaveBeenNthCalledWith(1, 0);
      expect(reconnectDelaySpy).toHaveBeenNthCalledWith(2, 1);
    } finally {
      reconnectDelaySpy.mockRestore();
    }
  });

  it("does not call individual tracker getView/connect when external view is provided", async () => {
    const externalView = aFakeTrackerViewStateWith({
      trackerId: "tracker-1",
      status: "active",
      statsHighlights: [{ label: "KDA", value: "2.1" }],
    });
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({ trackerId: "tracker-1", status: "active" }),
    });
    const getViewSpy = vi.spyOn(individualTrackerViewService, "getView");
    const connectSpy = vi.spyOn(individualTrackerViewService, "connect");
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        medalMetadataResolver,
        trackerId: "tracker-1",
        externalView,
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
      expect(result.current.model.renderModel?.statsHighlights?.[0]?.value).toBe("2.1");
      expect(result.current.model.connectionStatus).toBe("connected");
    });

    expect(getViewSpy).not.toHaveBeenCalled();
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it("updates model when external view changes", async () => {
    const initialView = aFakeTrackerViewStateWith({
      trackerId: "tracker-1",
      status: "active",
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" })],
      statsHighlights: [{ label: "KDA", value: "2.1" }],
    });
    const updatedView = aFakeTrackerViewStateWith({
      trackerId: "tracker-1",
      status: "active",
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "m-1" }), aFakeTrackerMatchSummaryWith({ matchId: "m-2" })],
      statsHighlights: [{ label: "KDA", value: "3.4" }],
    });
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({ trackerId: "tracker-1", status: "active" }),
    });
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();

    const { result, rerender } = renderHook(
      ({ externalView }: { externalView: ReturnType<typeof aFakeTrackerViewStateWith> }) =>
        useIndividualTrackerViewer({
          individualTrackerViewService,
          matchAnalyticsService,
          seriesMatchesService,
          medalMetadataResolver,
          trackerId: "tracker-1",
          externalView,
        }),
      {
        initialProps: { externalView: initialView },
      },
    );

    await waitFor(() => {
      expect(result.current.model.renderModel?.timeline.length).toBe(1);
      expect(result.current.model.renderModel?.statsHighlights?.[0]?.value).toBe("2.1");
    });

    rerender({ externalView: updatedView });

    await waitFor(() => {
      expect(result.current.model.renderModel?.timeline.length).toBe(2);
      expect(result.current.model.renderModel?.statsHighlights?.[0]?.value).toBe("3.4");
    });
  });

  it("ignores stale managed load completion after switching to external view", async () => {
    const managedView = aFakeTrackerViewStateWith({
      trackerId: "tracker-1",
      status: "active",
      statsHighlights: [{ label: "KDA", value: "2.1" }],
    });
    const externalView = aFakeTrackerViewStateWith({
      trackerId: "tracker-1",
      status: "active",
      statsHighlights: [{ label: "KDA", value: "9.9" }],
    });
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({ view: managedView });
    const connectSpy = vi.spyOn(individualTrackerViewService, "connect");

    let resolveGetView: ((value: { view: ReturnType<typeof aFakeTrackerViewStateWith> }) => void) | undefined;
    const getViewPending = new Promise<{ view: ReturnType<typeof aFakeTrackerViewStateWith> }>((resolve) => {
      resolveGetView = resolve;
    });
    vi.spyOn(individualTrackerViewService, "getView").mockImplementationOnce(async () => getViewPending);

    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();

    const { result, rerender } = renderHook<
      ReturnType<typeof useIndividualTrackerViewer>,
      { nextExternalView: ReturnType<typeof aFakeTrackerViewStateWith> | undefined }
    >(
      ({ nextExternalView }) =>
        useIndividualTrackerViewer({
          individualTrackerViewService,
          matchAnalyticsService,
          seriesMatchesService,
          medalMetadataResolver,
          trackerId: "tracker-1",
          externalView: nextExternalView,
        }),
      { initialProps: { nextExternalView: undefined } },
    );

    rerender({ nextExternalView: externalView });
    resolveGetView?.({ view: managedView });

    await waitFor(() => {
      expect(result.current.model.renderModel?.statsHighlights?.[0]?.value).toBe("9.9");
    });

    expect(connectSpy).not.toHaveBeenCalled();
  });

  it("disconnects managed websocket updates when switching to external view", async () => {
    const managedView = aFakeTrackerViewStateWith({
      trackerId: "tracker-1",
      status: "active",
      statsHighlights: [{ label: "KDA", value: "2.1" }],
    });
    const externalView = aFakeTrackerViewStateWith({
      trackerId: "tracker-1",
      status: "active",
      statsHighlights: [{ label: "KDA", value: "9.9" }],
    });
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({ view: managedView });
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();

    const { result, rerender } = renderHook<
      ReturnType<typeof useIndividualTrackerViewer>,
      { nextExternalView: ReturnType<typeof aFakeTrackerViewStateWith> | undefined }
    >(
      ({ nextExternalView }: { nextExternalView: ReturnType<typeof aFakeTrackerViewStateWith> | undefined }) =>
        useIndividualTrackerViewer({
          individualTrackerViewService,
          matchAnalyticsService,
          seriesMatchesService,
          medalMetadataResolver,
          trackerId: "tracker-1",
          externalView: nextExternalView,
        }),
      { initialProps: { nextExternalView: undefined } },
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
      expect(result.current.model.renderModel?.statsHighlights?.[0]?.value).toBe("2.1");
      expect(individualTrackerViewService.lastConnection).not.toBeNull();
    });

    const managedConnection = individualTrackerViewService.lastConnection;

    rerender({ nextExternalView: externalView });

    await waitFor(() => {
      expect(result.current.model.renderModel?.statsHighlights?.[0]?.value).toBe("9.9");
    });

    act(() => {
      managedConnection?.emitView({
        ...aFakeTrackerLiveViewWith({
          trackerId: "tracker-1",
          status: "active",
        }),
        statsHighlights: [{ label: "KDA", value: "1.1" }],
      });
    });

    expect(result.current.model.renderModel?.statsHighlights?.[0]?.value).toBe("9.9");
  });

  it("updates stats highlights directly from websocket payloads", async () => {
    const firstView = aFakeTrackerViewStateWith({
      trackerId: "tracker-1",
      status: "active",
      statsHighlights: [{ label: "KDA", value: "2.1" }],
    });
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({ view: firstView });
    const getViewSpy = vi.spyOn(individualTrackerViewService, "getView");
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        medalMetadataResolver,
        trackerId: "tracker-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
      expect(result.current.model.renderModel?.statsHighlights?.[0]?.value).toBe("2.1");
      expect(individualTrackerViewService.lastConnection).not.toBeNull();
    });

    act(() => {
      individualTrackerViewService.lastConnection?.emitView({
        ...aFakeTrackerLiveViewWith({
          trackerId: "tracker-1",
          status: "active",
        }),
        statsHighlights: [{ label: "KDA", value: "3.4" }],
      });
    });

    await waitFor(() => {
      expect(getViewSpy).toHaveBeenCalledTimes(1);
      expect(result.current.model.renderModel?.statsHighlights?.[0]?.value).toBe("3.4");
    });
  });

  it("clears stats highlights when websocket payload omits them", async () => {
    const firstView = aFakeTrackerViewStateWith({
      trackerId: "tracker-1",
      status: "active",
      statsHighlights: [{ label: "KDA", value: "2.1" }],
    });
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({ view: firstView });
    const getViewSpy = vi.spyOn(individualTrackerViewService, "getView");
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        medalMetadataResolver,
        trackerId: "tracker-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
      expect(result.current.model.renderModel?.statsHighlights?.[0]?.value).toBe("2.1");
      expect(individualTrackerViewService.lastConnection).not.toBeNull();
    });

    act(() => {
      individualTrackerViewService.lastConnection?.emitView(
        aFakeTrackerLiveViewWith({
          trackerId: "tracker-1",
          status: "active",
          matches: [aFakeTrackerMatchSummaryWith({ matchId: "match-2" })],
        }),
      );
    });

    await waitFor(() => {
      expect(getViewSpy).toHaveBeenCalledTimes(1);
      expect(result.current.model.renderModel?.statsHighlights).toBeUndefined();
    });
  });

  it("preserves server streamer settings when websocket payload omits streamerSettings", async () => {
    const serverSettings: StreamerViewSettings = {
      styleFlags: {
        colorMode: "observer",
      },
    };
    const localSettings: StreamerViewSettings = {
      styleFlags: {
        colorMode: "player",
      },
    };
    const firstView = {
      ...aFakeTrackerViewStateWith({
        trackerId: "tracker-1",
        status: "active",
      }),
      streamerSettings: serverSettings,
    };
    const websocketViewWithoutSettings = aFakeTrackerLiveViewWith({
      trackerId: "tracker-1",
      status: "active",
      matches: [aFakeTrackerMatchSummaryWith({ matchId: "match-2" })],
    });
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({ view: firstView });
    const getViewSpy = vi.spyOn(individualTrackerViewService, "getView");
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        medalMetadataResolver,
        trackerId: "tracker-1",
        streamerSettings: localSettings,
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
      expect(result.current.model.streamerSettings?.styleFlags?.colorMode).toBe("observer");
      expect(individualTrackerViewService.lastConnection).not.toBeNull();
    });

    act(() => {
      individualTrackerViewService.lastConnection?.emitView(websocketViewWithoutSettings);
    });

    await waitFor(() => {
      expect(getViewSpy).toHaveBeenCalledTimes(1);
      expect(result.current.model.streamerSettings?.styleFlags?.colorMode).toBe("observer");
    });
  });

  it("renders observer colours when the streamer selects observer mode", async () => {
    const view = {
      ...aFakeTrackerViewStateWith({ trackerId: "tracker-1", status: "active" }),
      streamerSettings: {
        styleFlags: {
          colorMode: "observer",
          playerTeamColor: "cerulean",
          playerEnemyColor: "salmon",
          observerTeamColor: "mint",
          observerEnemyColor: "lavender",
        },
      } satisfies StreamerViewSettings,
    };
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({ view });
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        medalMetadataResolver,
        trackerId: "tracker-1",
      }),
    );

    await waitFor(() => {
      expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    });

    const [teamColor, enemyColor] = result.current.model.renderModel?.teamColors ?? [];
    expect(teamColor.id).toBe("mint");
    expect(enemyColor.id).toBe("lavender");
  });

  it.each([false, true])(
    "aligns overview scores without changing detail scores when substitution is %s",
    async (substituted) => {
      const matchId = "m-1";
      const detail = aFakeViewerSeriesMatchWith({ matchId });
      const secondMatchId = "m-2";
      const secondDetail = aFakeViewerSeriesMatchWith({
        matchId: secondMatchId,
        players: detail.players.map((player) => ({
          ...player,
          playerId: substituted && player.playerId === "xuid(4444444444)" ? "xuid(5555555555)" : player.playerId,
          lastMatchTeamId: 1 - (player.lastMatchTeamId ?? 0),
          teamStats: player.teamStats.map((stats) => ({ ...stats, matchTeamId: 1 - stats.matchTeamId })),
        })),
        teams: detail.teams.map((team) => ({ ...team, seriesTeamId: 1 - team.matchTeamId })),
        score: {
          primary: {
            metric: "score",
            teams: [
              { matchTeamId: 0, seriesTeamId: 1, value: 40 },
              { matchTeamId: 1, seriesTeamId: 0, value: 50 },
            ],
          },
          secondary: {
            metric: "score",
            teams: [
              { matchTeamId: 0, seriesTeamId: 1, value: 60 },
              { matchTeamId: 1, seriesTeamId: 0, value: 80 },
            ],
          },
        },
      });
      const series = {
        ...aFakeTrackerSeriesGroupWith({ id: "series-1", matchIds: [matchId, secondMatchId] }),
        teams: [
          {
            id: 0,
            name: "Alpha",
            players: [
              { discordId: null, discordName: null, gamertag: "Alpha One", xboxId: "3333333333" },
              { discordId: null, discordName: null, gamertag: "Alpha Two", xboxId: null },
            ],
          },
          {
            id: 1,
            name: "Beta",
            players: [
              { discordId: null, discordName: null, gamertag: "Beta One", xboxId: "1111111111" },
              { discordId: null, discordName: null, gamertag: "Beta Two", xboxId: "2222222222" },
            ],
          },
        ],
      };
      const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
        view: aFakeTrackerViewStateWith({
          trackerId: "tracker-1",
          status: "active",
          matches: [
            aFakeTrackerMatchSummaryWith({ matchId }),
            aFakeTrackerMatchSummaryWith({ matchId: secondMatchId }),
          ],
          series: [series],
        }),
      });
      const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();
      let resolveSeriesAnalytics: ((value: Record<string, MatchAnalytics | null>) => void) | undefined;
      const seriesAnalyticsPromise = new Promise<Record<string, MatchAnalytics | null>>((resolve) => {
        resolveSeriesAnalytics = resolve;
      });
      vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics").mockImplementation(async () => seriesAnalyticsPromise);
      const seriesDetailService = aFakeSeriesDetailServiceWith({
        response: aFakeViewerSeriesDetailWith([matchId, secondMatchId], {
          matches: {
            matchIds: [matchId, secondMatchId],
            results: [detail, secondDetail].map((match) => ({
              status: "resolved",
              matchId: match.matchId,
              detail: { ...match, map: { ...match.map, thumbnailUrl: "https://cdn.test/map.jpg" } },
            })),
          },
        }),
      });

      const { result } = renderHook(() =>
        useIndividualTrackerViewer({
          individualTrackerViewService,
          matchAnalyticsService,
          seriesMatchesService,
          seriesDetailService,
          medalMetadataResolver,
          trackerId: "tracker-1",
        }),
      );

      await waitFor(() => {
        expect(result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
      });

      const seriesItem = result.current.model.renderModel?.timeline.find((item) => item.type === "series");
      act(() => {
        if (seriesItem?.type === "series") {
          result.current.onToggleEntry(seriesItem);
        }
      });

      await waitFor(() => {
        expect(result.current.snapshot.entryStates.get("series:series-1")).toMatchObject({
          kind: "series",
          state: { status: "loaded" },
        });
      });

      const loadedSeries = result.current.model.renderModel?.timeline.find(
        (item) => item.type === "series" && item.series.id === "series-1",
      );
      expect(loadedSeries?.type).toBe("series");
      if (loadedSeries?.type !== "series") {
        throw new Error("Expected a loaded series timeline item");
      }
      expect(loadedSeries.series.seriesOverview.matches[0]?.score).toBe("40:50");
      expect(loadedSeries.series.seriesOverview.matches[0]?.subScore).toBe("60:80");
      expect(loadedSeries.series.seriesOverview.matches[0]?.mapBackgroundUrl).toBe("https://cdn.test/map.jpg");
      expect(loadedSeries.series.seriesOverview.matches[1]?.score).toBe("40:50");
      expect(loadedSeries.series.seriesOverview.matches[1]?.subScore).toBe("60:80");
      const state = result.current.snapshot.entryStates.get("series:series-1");
      if (state?.kind !== "series" || state.state.status !== "loaded") {
        throw new Error("Expected loaded series details");
      }
      expect(state.state.data.matches.results[0]).toMatchObject({ status: "resolved", detail: { matchId } });

      act(() => {
        result.current.onLoadAnalytics(loadedSeries, "killMatrix");
      });
      expect(result.current.snapshot.entryStates.get("series:series-1")).toMatchObject({
        state: {
          analyticsByMatchId: new Map(
            [matchId, secondMatchId].map((id) => [
              id,
              {
                killMatrix: { status: ComponentLoaderStatus.LOADING, data: null },
              },
            ]),
          ),
        },
      });
      await act(async () => {
        resolveSeriesAnalytics?.(
          Object.fromEntries(
            [matchId, secondMatchId].map((id) => [
              id,
              aFakeMatchAnalyticsWith({ requestedModules: ["killMatrix"], killMatrix: {} }),
            ]),
          ),
        );
        await seriesAnalyticsPromise;
      });
      await waitFor(() => {
        expect(result.current.snapshot.entryStates.get("series:series-1")).toMatchObject({
          state: {
            analyticsByMatchId: new Map(
              [matchId, secondMatchId].map((id) => [
                id,
                {
                  killMatrix: { status: ComponentLoaderStatus.LOADED, data: {} },
                },
              ]),
            ),
          },
        });
      });
    },
  );

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
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();
    const seriesDetailService = aFakeSeriesDetailServiceWith({ response: aFakeViewerSeriesDetailWith(matchIds) });
    const getSeriesDetailSpy = vi.spyOn(seriesDetailService, "getSeriesDetail");

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        seriesDetailService,
        medalMetadataResolver,
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
      expect(getSeriesDetailSpy).toHaveBeenCalledTimes(1);
    });

    expect(getSeriesDetailSpy).toHaveBeenCalledWith("series-1", matchIds, "tracker-1", "substitution-aware");

    const state = result.current.snapshot.entryStates.get("series:series-1");
    expect(state?.kind).toBe("series");
    if (state?.kind !== "series" || state.state.status !== "loaded") {
      throw new Error("Expected loaded series");
    }
    expect(state.state.analyticsByMatchId.size).toBe(0);
  });

  it("keeps series cross-team kill matrix empty when analytics contain no kill-matrix rows", async () => {
    const matchIds = ["m-1", "m-2"];
    const matches = matchIds.map((matchId) => aFakeTrackerMatchSummaryWith({ matchId }));
    const individualTrackerViewService = aFakeIndividualTrackerViewServiceWith({
      view: aFakeTrackerViewStateWith({
        trackerId: "tracker-1",
        status: "active",
        matches,
        series: [aFakeTrackerSeriesGroupWith({ id: "series-1", title: "Series With Empty Analytics", matchIds })],
      }),
    });
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();
    const seriesDetailService = aFakeSeriesDetailServiceWith({ response: aFakeViewerSeriesDetailWith(matchIds) });
    vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics").mockImplementation(async (ids) =>
      Promise.resolve(
        Object.fromEntries(
          ids.map((id) => [id, aFakeMatchAnalyticsWith({ requestedModules: ["killMatrix"], killMatrix: {} })]),
        ),
      ),
    );

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        seriesDetailService,
        medalMetadataResolver,
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
      if (state?.kind !== "series" || state.state.status !== "loaded") {
        throw new Error("Expected loaded series");
      }
      expect(state.state.analyticsByMatchId.size).toBe(0);
    });
    if (seriesItem?.type !== "series") {
      throw new Error("Expected series");
    }
    act(() => {
      result.current.onLoadAnalytics(seriesItem, "killMatrix");
    });
    await waitFor(() => {
      const state = result.current.snapshot.entryStates.get("series:series-1");
      if (state?.kind !== "series" || state.state.status !== "loaded") {
        throw new Error("Expected loaded series");
      }
      expect(state.state.analyticsByMatchId.get("m-1")?.killMatrix).toEqual({
        status: ComponentLoaderStatus.LOADED,
        data: {},
      });
    });
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
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();
    const seriesDetailService = aFakeSeriesDetailServiceWith({ response: aFakeViewerSeriesDetailWith(["m-1", "m-2"]) });
    const getSeriesDetailSpy = vi
      .spyOn(seriesDetailService, "getSeriesDetail")
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(aFakeViewerSeriesDetailWith(["m-1", "m-2"]));

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        seriesDetailService,
        medalMetadataResolver,
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
      expect(getSeriesDetailSpy).toHaveBeenCalledTimes(2);
    });
  });

  it("requests one backend aggregation for very large series", async () => {
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
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();
    const seriesDetailService = aFakeSeriesDetailServiceWith({ response: aFakeViewerSeriesDetailWith(matchIds) });
    const getSeriesDetailSpy = vi.spyOn(seriesDetailService, "getSeriesDetail");

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        seriesDetailService,
        medalMetadataResolver,
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
      expect(getSeriesDetailSpy).toHaveBeenCalledTimes(1);
    });

    expect(getSeriesDetailSpy).toHaveBeenCalledWith("series-1", matchIds, "tracker-1", "substitution-aware");
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
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();
    const matchA = aFakeViewerSeriesMatchWith({
      matchId: "m-1",
      startTime: "2026-01-01T00:00:00.000Z",
      endTime: "2026-01-01T00:10:00.000Z",
    });
    const matchB = aFakeViewerSeriesMatchWith({
      matchId: "m-2",
      startTime: "2026-01-01T00:20:00.000Z",
      endTime: "2026-01-01T00:30:00.000Z",
      teams: matchA.teams.map((team) => ({ ...team, matchTeamId: team.matchTeamId + 4, name: null })),
    });

    const seriesDetailService = aFakeSeriesDetailServiceWith({
      response: aFakeViewerSeriesDetailWith(matchIds, {
        matches: {
          matchIds,
          results: [matchB, matchA].map((detail) => ({
            status: "resolved",
            matchId: detail.matchId,
            detail,
          })),
        },
      }),
    });

    const { result } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        seriesDetailService,
        medalMetadataResolver,
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
        const loadedSeries = result.current.model.renderModel?.timeline.find((item) => item.type === "series");
        expect(loadedSeries?.type === "series" && loadedSeries.series.seriesOverview.teams[0]?.name).toBe("Rampart");
      }
    });
  });

  it("ignores whole-series detail completion after dispose", async () => {
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
    const { matchAnalyticsService, seriesMatchesService, medalMetadataResolver } = aViewerTestDependenciesWith();
    let resolveFirstBatch: ((value: SeriesDetailResponse) => void) | undefined;
    const firstBatchPromise = new Promise<SeriesDetailResponse>((resolve) => {
      resolveFirstBatch = resolve;
    });
    const seriesDetailService = aFakeSeriesDetailServiceWith();
    const getSeriesDetailSpy = vi.spyOn(seriesDetailService, "getSeriesDetail").mockReturnValue(firstBatchPromise);

    const { result, unmount } = renderHook(() =>
      useIndividualTrackerViewer({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        seriesDetailService,
        medalMetadataResolver,
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
      expect(getSeriesDetailSpy).toHaveBeenCalledTimes(1);
    });

    const pending = result.current.snapshot;
    unmount();

    expect(resolveFirstBatch).toBeDefined();
    resolveFirstBatch?.(aFakeViewerSeriesDetailWith(matchIds));
    await firstBatchPromise;

    await waitFor(() => {
      expect(result.current.snapshot).toBe(pending);
    });
  });
});
