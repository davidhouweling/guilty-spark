import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { ComponentLoaderStatus } from "../../../component-loader/component-loader";
import { aFakeIndividualTrackerServiceWith } from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import {
  aFakeIndividualTrackerViewServiceWith,
  aFakeTrackerLiveViewWith,
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
});
