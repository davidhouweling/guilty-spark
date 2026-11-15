import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import { aFakeIndividualTrackerServiceWith } from "../../../services/individual-tracker/fakes/individual-tracker.fake";
import { aFakeIndividualTrackerSettingsServiceWith } from "../../../services/individual-tracker/fakes/settings.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../services/stats/fakes/match-analytics.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../services/series-matches/fakes/series-matches.fake";
import { aFakeHaloClientWith } from "../../../services/fakes/halo-client.fake";
import { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import { useMatchHistoryViewer } from "../use-match-history-viewer";

describe("useMatchHistoryViewer", () => {
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
