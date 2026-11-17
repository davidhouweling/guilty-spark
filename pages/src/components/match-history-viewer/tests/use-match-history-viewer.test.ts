import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import {
  aFakeCondensedMatchHistoryEntryWith,
  aFakeIndividualTrackerServiceWith,
} from "../../../services/individual-tracker/fakes/individual-tracker.fake";
import { aFakeIndividualTrackerSettingsServiceWith } from "../../../services/individual-tracker/fakes/settings.fake";
import {
  aFakeCtfMatchAnalyticsWith,
  aFakeMatchAnalyticsServiceWith,
} from "../../../services/stats/fakes/match-analytics.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../services/series-matches/fakes/series-matches.fake";
import { aFakeHaloClientWith } from "../../../services/fakes/halo-client.fake";
import { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import { useMatchHistoryViewer } from "../use-match-history-viewer";

describe("useMatchHistoryViewer", () => {
  it("loads grouped series without a tracker hint and ignores pending analytics after remount", async () => {
    const matchIds = ["history-first", "history-second"];
    const seriesMatchesService = aFakeSeriesMatchesServiceWith();
    const getDetails = vi.spyOn(seriesMatchesService, "getSeriesDetail");
    const matchAnalyticsService = aFakeMatchAnalyticsServiceWith();
    const getAnalytics = vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics");
    let resolvePending: ((value: Record<string, MatchAnalytics | null>) => void) | undefined;
    const pending = new Promise<Record<string, MatchAnalytics | null>>((resolve) => {
      resolvePending = resolve;
    });
    getAnalytics.mockReturnValueOnce(pending);
    const options = {
      individualTrackerService: aFakeIndividualTrackerServiceWith({
        condensedMatchHistory: {
          matches: matchIds.map((matchId) => aFakeCondensedMatchHistoryEntryWith({ matchId })),
          suggestedGroupings: [matchIds],
        },
      }),
      matchAnalyticsService,
      seriesMatchesService,
      medalMetadataResolver: new HaloMedalMetadataResolver(aFakeHaloClientWith()),
      gamertag: "Fake Spartan",
    };
    const individualTrackerSettingsService = aFakeIndividualTrackerSettingsServiceWith();
    const mounted = renderHook(() => useMatchHistoryViewer({ ...options, individualTrackerSettingsService }));
    await waitFor(() => {
      expect(mounted.result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    });
    const item = mounted.result.current.model.renderModel?.timeline.find((entry) => entry.type === "series");
    if (item?.type !== "series") {
      throw new Error("Expected grouped series");
    }
    const key = `series:${item.series.id}`;
    act(() => {
      mounted.result.current.onToggleEntry(item);
    });
    await waitFor(() => {
      expect(mounted.result.current.snapshot.entryStates.get(key)?.state.status).toBe("loaded");
    });
    expect(getDetails).toHaveBeenCalledExactlyOnceWith(item.series.id, matchIds, undefined, "substitution-aware");
    expect(getAnalytics).not.toHaveBeenCalled();
    act(() => {
      mounted.result.current.onLoadAnalytics(item, "killMatrix");
    });
    expect(getAnalytics).toHaveBeenCalledExactlyOnceWith(matchIds, ["killMatrix"]);

    mounted.unmount();
    const remounted = renderHook(() => useMatchHistoryViewer({ ...options, individualTrackerSettingsService }));
    await waitFor(() => {
      expect(remounted.result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    });
    expect(remounted.result.current.snapshot.entryStates.size).toBe(0);
    act(() => {
      remounted.result.current.onToggleEntry(item);
    });
    await waitFor(() => {
      expect(remounted.result.current.snapshot.entryStates.get(key)?.state.status).toBe("loaded");
    });
    act(() => {
      remounted.result.current.onLoadAnalytics(item, "killMatrix");
    });
    await waitFor(() => {
      const state = remounted.result.current.snapshot.entryStates.get(key)?.state;
      if (state?.status !== "loaded" || !("analyticsByMatchId" in state)) {
        throw new Error("Expected loaded series");
      }
      expect(state.analyticsByMatchId.get(matchIds[0])?.killMatrix?.status).toBe(ComponentLoaderStatus.LOADED);
    });
    const replacement = remounted.result.current.snapshot;
    await act(async () => {
      Preconditions.checkExists(resolvePending)(
        Object.fromEntries(matchIds.map((id) => [id, aFakeCtfMatchAnalyticsWith({ killMatrix: {} })])),
      );
      await pending;
    });
    expect(remounted.result.current.snapshot).toBe(replacement);
    expect(getAnalytics).toHaveBeenCalledTimes(2);
    remounted.unmount();
  });

  it("creates fresh entry-detail state when the presenter is replaced or history remounts", async () => {
    const seriesMatchesService = aFakeSeriesMatchesServiceWith();
    const getDetails = vi.spyOn(seriesMatchesService, "getMatchDetails");
    const options = {
      individualTrackerService: aFakeIndividualTrackerServiceWith(),
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      seriesMatchesService,
      medalMetadataResolver: new HaloMedalMetadataResolver(aFakeHaloClientWith()),
      gamertag: "Fake Spartan",
    };
    const mounted = renderHook(
      ({ individualTrackerSettingsService }) => useMatchHistoryViewer({ ...options, individualTrackerSettingsService }),
      { initialProps: { individualTrackerSettingsService: aFakeIndividualTrackerSettingsServiceWith() } },
    );
    await waitFor(() => {
      expect(mounted.result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    });
    mounted.rerender({ individualTrackerSettingsService: aFakeIndividualTrackerSettingsServiceWith() });
    await waitFor(() => {
      expect(mounted.result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    });
    const item = mounted.result.current.model.renderModel?.timeline.find((entry) => entry.type === "match");
    if (item == null) {
      throw new Error("Expected match entry");
    }
    const key = `match:${item.match.matchId}`;
    act(() => {
      mounted.result.current.onToggleEntry(item);
    });
    await waitFor(() => {
      expect(mounted.result.current.snapshot.entryStates.get(key)?.state.status).toBe("loaded");
    });
    mounted.unmount();

    const remountedSettingsService = aFakeIndividualTrackerSettingsServiceWith();
    const remounted = renderHook(() =>
      useMatchHistoryViewer({
        ...options,
        individualTrackerSettingsService: remountedSettingsService,
      }),
    );
    await waitFor(() => {
      expect(remounted.result.current.snapshot.status).toBe(ComponentLoaderStatus.LOADED);
    });
    expect(remounted.result.current.snapshot.entryStates.size).toBe(0);
    act(() => {
      remounted.result.current.onToggleEntry(item);
    });
    await waitFor(() => {
      expect(remounted.result.current.snapshot.entryStates.get(key)?.state.status).toBe("loaded");
    });
    expect(getDetails).toHaveBeenCalledTimes(2);
    expect(getDetails).toHaveBeenLastCalledWith([item.match.matchId], undefined);
    remounted.unmount();
  });
});
