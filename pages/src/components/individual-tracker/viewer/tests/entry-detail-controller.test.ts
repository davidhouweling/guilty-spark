import { describe, expect, it, vi } from "vitest";
import type { MatchDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import { aFakeMatchDetailResponseWith } from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aFakeHaloClientWith } from "../../../../services/fakes/halo-client.fake";
import { HaloMedalMetadataResolver } from "../../../../services/halo/medal-metadata-resolver";
import { aFakeTrackerViewStateWith } from "../../../../services/individual-tracker/fakes/view.fake";
import { aFakeMatchDetailsServiceWith } from "../../../../services/stats/fakes/match-details.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../../services/stats/fakes/match-analytics.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../../services/stats/fakes/series-matches.fake";
import { ComponentLoaderStatus } from "../../../component-loader/component-loader";
import { EntryDetailController } from "../entry-detail-controller";
import { IndividualTrackerViewerStore } from "../viewer-store";
import { IndividualTrackerViewerPresenter } from "../viewer-presenter";
import type { ViewerTimelineItem } from "../types";

function setup(): {
  store: IndividualTrackerViewerStore;
  item: Extract<ViewerTimelineItem, { type: "match" }>;
  controller: EntryDetailController;
  matchDetailsService: ReturnType<typeof aFakeMatchDetailsServiceWith>;
  matchAnalyticsService: ReturnType<typeof aFakeMatchAnalyticsServiceWith>;
  key: string;
} {
  const store = new IndividualTrackerViewerStore();
  store.setLoaded(aFakeTrackerViewStateWith({ series: [] }));
  const item = Preconditions.checkExists(
    IndividualTrackerViewerPresenter.present(store.getSnapshot()).renderModel?.timeline[0],
    "Expected timeline entry",
  );
  const matchDetailsService = aFakeMatchDetailsServiceWith();
  const matchAnalyticsService = aFakeMatchAnalyticsServiceWith();
  const controller = new EntryDetailController({
    store,
    matchDetailsService,
    matchAnalyticsService,
    seriesMatchesService: aFakeSeriesMatchesServiceWith(),
    medalMetadataResolver: new HaloMedalMetadataResolver(aFakeHaloClientWith()),
    trackerId: "tracker-one",
  });
  if (item.type !== "match") {
    throw new Error("Expected single match");
  }
  return { store, item, controller, matchDetailsService, matchAnalyticsService, key: `match:${item.match.matchId}` };
}

describe("EntryDetailController condensed match loading", () => {
  it("retries unavailable details and failed analytics while deduplicating loaded modules and expansion", async () => {
    const { store, item, controller, matchDetailsService, matchAnalyticsService, key } = setup();
    const detailSpy = vi
      .spyOn(matchDetailsService, "getMatchDetails")
      .mockResolvedValueOnce(aFakeMatchDetailResponseWith({ matchIds: [item.match.matchId], results: [] }));
    const analyticsSpy = vi
      .spyOn(matchAnalyticsService, "getBatchMatchAnalytics")
      .mockRejectedValueOnce(new Error("offline"));

    controller.toggleEntry(item);
    await vi.waitFor(() => {
      expect(store.getSnapshot().entryStates.get(key)?.state.status).toBe("error");
    });
    controller.toggleEntry(item);
    controller.toggleEntry(item);
    await vi.waitFor(() => {
      expect(store.getSnapshot().entryStates.get(key)?.state.status).toBe("loaded");
    });
    const beforeAnalytics = store.getSnapshot();
    expect(detailSpy).toHaveBeenNthCalledWith(2, [item.match.matchId], "tracker-one");

    controller.loadAnalytics(item, "killMatrix");
    await vi.waitFor(() => {
      expect(store.getSnapshot().entryStates.get(key)?.state).toMatchObject({
        killMatrixStatus: ComponentLoaderStatus.ERROR,
      });
    });
    controller.loadAnalytics(item, "killMatrix");
    controller.loadAnalytics(item, "killMatrix");
    await vi.waitFor(() => {
      expect(store.getSnapshot().entryStates.get(key)?.state).toMatchObject({
        killMatrixStatus: ComponentLoaderStatus.LOADED,
      });
    });
    expect(analyticsSpy).toHaveBeenCalledTimes(2);
    expect(beforeAnalytics.entryStates.get(key)?.state).toMatchObject({
      killMatrixStatus: ComponentLoaderStatus.PENDING,
    });
    controller.toggleEntry(item);
    controller.toggleEntry(item);
    expect(detailSpy).toHaveBeenCalledTimes(2);
  });

  it("ignores condensed detail completion after disposal", async () => {
    const { store, item, controller, matchDetailsService } = setup();
    let resolveDetails: ((value: MatchDetailResponse) => void) | undefined;
    const request = new Promise<MatchDetailResponse>((resolve) => {
      resolveDetails = resolve;
    });
    vi.spyOn(matchDetailsService, "getMatchDetails").mockReturnValue(request);
    controller.toggleEntry(item);
    const pending = store.getSnapshot();
    controller.dispose();
    resolveDetails?.(aFakeMatchDetailResponseWith());
    await request;
    await Promise.resolve();
    expect(store.getSnapshot()).toBe(pending);
  });

  it("ignores analytics completion after disposal", async () => {
    const { store, item, controller, matchAnalyticsService, key } = setup();
    controller.toggleEntry(item);
    await vi.waitFor(() => {
      expect(store.getSnapshot().entryStates.get(key)?.state.status).toBe("loaded");
    });
    let resolveAnalytics: ((value: Record<string, null>) => void) | undefined;
    const request = new Promise<Record<string, null>>((resolve) => {
      resolveAnalytics = resolve;
    });
    vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics").mockReturnValue(request);
    controller.loadAnalytics(item, "scoreProgression");
    const pending = store.getSnapshot();
    controller.dispose();
    resolveAnalytics?.({});
    await request;
    expect(store.getSnapshot()).toBe(pending);
  });
});
