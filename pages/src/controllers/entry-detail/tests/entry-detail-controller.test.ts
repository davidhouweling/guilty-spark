import { describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { MatchDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import type { AnalyticsModule, MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { aFakeMatchDetailResponseWith } from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import {
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerSeriesGroupWith,
  aFakeTrackerViewStateWith,
} from "../../../services/individual-tracker/fakes/view.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../services/stats/fakes/match-analytics.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../services/series-matches/fakes/series-matches.fake";
import type { SeriesMatchesService } from "../../../services/series-matches/types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import { aFakeMatchAnalyticsWith } from "../../stats/kill-matrix/fakes/match-analytics.fake";
import { StatsDetailController } from "../../stats/stats-detail-controller";
import { ComponentLoaderStatus } from "../../../components/component-loader/component-loader";
import { SeriesDetailStatsViewModelPresenter } from "../../../components/series-stats/series-detail-stats-view-model-presenter";
import { EntryDetailController } from "../entry-detail-controller";
import { SeriesAnalyticsController } from "../../series-analytics/series-analytics-controller";
import { IndividualTrackerViewerStore } from "../../../components/individual-tracker/viewer/viewer-store";
import type { SeriesEntryLoadedState } from "../../../components/individual-tracker/viewer/viewer-store";
import { IndividualTrackerViewerPresenter } from "../../../components/individual-tracker/viewer/viewer-presenter";
import type { ViewerTimelineItem } from "../../../components/individual-tracker/viewer/types";
import { aFakeViewerSeriesDetailWith } from "../../../components/individual-tracker/viewer/fakes/series-detail.fake";

function setup(): {
  store: IndividualTrackerViewerStore;
  item: Extract<ViewerTimelineItem, { type: "match" }>;
  controller: EntryDetailController;
  seriesMatchesService: ReturnType<typeof aFakeSeriesMatchesServiceWith>;
  matchAnalyticsService: MatchAnalyticsService;
  key: string;
} {
  const store = new IndividualTrackerViewerStore();
  store.setLoaded(aFakeTrackerViewStateWith({ series: [] }));
  const item = Preconditions.checkExists(
    IndividualTrackerViewerPresenter.present(store.getSnapshot()).renderModel?.timeline[0],
    "Expected timeline entry",
  );
  const seriesMatchesService = aFakeSeriesMatchesServiceWith();
  const matchAnalyticsService: MatchAnalyticsService = aFakeMatchAnalyticsServiceWith();
  const controller = new EntryDetailController({
    store,
    matchAnalyticsService,
    seriesMatchesService,
    statsDetailController: new StatsDetailController(),
    trackerId: "tracker-one",
    createSeriesAnalyticsController: (onChange): SeriesAnalyticsController =>
      new SeriesAnalyticsController({ matchAnalyticsService, trackerId: "tracker-one", onChange }),
  });
  if (item.type !== "match") {
    throw new Error("Expected single match");
  }
  return { store, item, controller, seriesMatchesService, matchAnalyticsService, key: `match:${item.match.matchId}` };
}

function setupSeries(
  matchIds: readonly string[],
  response = aFakeViewerSeriesDetailWith(matchIds),
): {
  store: IndividualTrackerViewerStore;
  item: Extract<ViewerTimelineItem, { type: "series" }>;
  controller: EntryDetailController;
  seriesMatchesService: ReturnType<typeof aFakeSeriesMatchesServiceWith>;
  matchAnalyticsService: MatchAnalyticsService;
  legacySpy: MockInstance<SeriesMatchesService["getSeriesMatches"]>;
} {
  const store = new IndividualTrackerViewerStore();
  store.setLoaded(
    aFakeTrackerViewStateWith({
      matches: matchIds.map((matchId) => aFakeTrackerMatchSummaryWith({ matchId })),
      series: [aFakeTrackerSeriesGroupWith({ id: "series-1", matchIds: [...matchIds] })],
    }),
  );
  const item = IndividualTrackerViewerPresenter.present(store.getSnapshot()).renderModel?.timeline[0];
  if (item?.type !== "series") {
    throw new Error("Expected series");
  }
  const seriesMatchesService = aFakeSeriesMatchesServiceWith();
  vi.spyOn(seriesMatchesService, "getSeriesDetail").mockResolvedValue(response);
  const matchAnalyticsService: MatchAnalyticsService = aFakeMatchAnalyticsServiceWith();
  const legacySpy = vi.spyOn(seriesMatchesService, "getSeriesMatches");
  const controller = new EntryDetailController({
    store,
    matchAnalyticsService,
    seriesMatchesService,
    statsDetailController: new StatsDetailController(),
    trackerId: "tracker-one",
    createSeriesAnalyticsController: (onChange): SeriesAnalyticsController =>
      new SeriesAnalyticsController({ matchAnalyticsService, trackerId: "tracker-one", onChange }),
  });
  return { store, item, controller, seriesMatchesService, matchAnalyticsService, legacySpy };
}

function getLoadedSeriesState(store: IndividualTrackerViewerStore, key = "series:series-1"): SeriesEntryLoadedState {
  const entry = store.getSnapshot().entryStates.get(key);
  if (entry?.kind !== "series" || entry.state.status !== "loaded") {
    throw new Error("Expected loaded series details");
  }
  return entry.state;
}

describe("EntryDetailController condensed series loading", () => {
  it("isolates module loading between expanded series", async () => {
    const data = aFakeViewerSeriesDetailWith(["m-1", "m-2"]);
    const { store, item, controller, seriesMatchesService } = setupSeries(["m-1", "m-2"], data);
    const secondItem: Extract<ViewerTimelineItem, { type: "series" }> = {
      ...item,
      series: {
        ...item.series,
        id: "series-2",
        matches: item.series.matches.map((match, index) => ({ ...match, matchId: `m-${(index + 3).toString()}` })),
      },
    };
    vi.spyOn(seriesMatchesService, "getSeriesDetail")
      .mockResolvedValueOnce(data)
      .mockResolvedValueOnce(aFakeViewerSeriesDetailWith(["m-3", "m-4"], { seriesId: "series-2" }));
    controller.toggleEntry(item);
    controller.toggleEntry(secondItem);
    await vi.waitFor(() => {
      expect(getLoadedSeriesState(store).analyticsByMatchId.size).toBe(0);
      expect(getLoadedSeriesState(store, "series:series-2").analyticsByMatchId.size).toBe(0);
    });
    const secondState = getLoadedSeriesState(store, "series:series-2");
    controller.loadAnalytics(item, "killMatrix");
    await vi.waitFor(() => {
      expect(getLoadedSeriesState(store).analyticsByMatchId.get("m-1")?.killMatrix?.status).toBe(
        ComponentLoaderStatus.LOADED,
      );
    });
    expect(getLoadedSeriesState(store, "series:series-2")).toBe(secondState);
    const firstState = getLoadedSeriesState(store);
    controller.loadAnalytics(secondItem, "scoreProgression", "m-3");
    await vi.waitFor(() => {
      expect(
        getLoadedSeriesState(store, "series:series-2").analyticsByMatchId.get("m-3")?.scoreProgression?.status,
      ).toBe(ComponentLoaderStatus.LOADED);
    });
    expect(getLoadedSeriesState(store)).toBe(firstState);
  });

  it("preserves partial unavailable results and never calls the raw source", async () => {
    const data = aFakeViewerSeriesDetailWith(["missing", "m-1", "m-1"], {
      aggregation: { status: "unavailable", reason: "incomplete-matches" },
    });
    data.matches.results[0] = { status: "unavailable", matchId: "missing", reason: "not-found" };
    const { store, item, controller, seriesMatchesService, matchAnalyticsService, legacySpy } = setupSeries(
      ["missing", "m-1", "m-1"],
      data,
    );
    const detailSpy = vi.spyOn(seriesMatchesService, "getSeriesDetail");
    const analyticsSpy = vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics");
    controller.toggleEntry(item);
    await vi.waitFor(() => {
      expect(store.getSnapshot().entryStates.get("series:series-1")?.state.status).toBe("loaded");
    });
    expect(detailSpy).toHaveBeenCalledWith("series-1", ["missing", "m-1", "m-1"], "tracker-one", "substitution-aware");
    expect(store.getSnapshot().entryStates.get("series:series-1")?.state).toMatchObject({ data });
    expect(legacySpy).not.toHaveBeenCalled();
    expect(analyticsSpy).not.toHaveBeenCalled();
    controller.loadAnalytics(item, "killMatrix");
    await vi.waitFor(() => {
      expect(analyticsSpy).toHaveBeenCalledWith(["m-1"], ["killMatrix"], "tracker-one");
    });
  });

  it("loads only the selected timeline and retains concurrent module results and immutable snapshots", async () => {
    const { store, item, controller, matchAnalyticsService } = setupSeries(["m-1", "m-2"]);
    controller.toggleEntry(item);
    await vi.waitFor(() => {
      expect(store.getSnapshot().entryStates.get("series:series-1")?.state.status).toBe("loaded");
    });
    let resolveMatrix: ((value: Record<string, MatchAnalytics | null>) => void) | undefined;
    const matrix = new Promise<Record<string, MatchAnalytics | null>>((resolve) => {
      resolveMatrix = resolve;
    });
    const analytics = aFakeMatchAnalyticsWith({ requestedModules: ["scoreProgression", "killMatrix"] });
    const spy = vi
      .spyOn(matchAnalyticsService, "getBatchMatchAnalytics")
      .mockImplementation(async (_ids, modules) =>
        modules?.includes("scoreProgression") === true ? { "m-1": analytics } : matrix,
      );
    controller.loadAnalytics(item, "scoreProgression");
    controller.loadAnalytics(item, "scoreProgression", "missing");
    expect(spy).not.toHaveBeenCalled();
    controller.loadAnalytics(item, "killMatrix");
    const pending = store.getSnapshot().entryStates.get("series:series-1")?.state;
    controller.loadAnalytics(item, "scoreProgression", "m-1");
    controller.loadAnalytics(item, "scoreProgression", "m-1");
    await vi.waitFor(() => {
      expect(store.getSnapshot().entryStates.get("series:series-1")?.state).toMatchObject({
        analyticsByMatchId: new Map([
          [
            "m-1",
            {
              killMatrix: { status: ComponentLoaderStatus.LOADED, data: analytics.killMatrix },
              scoreProgression: { status: ComponentLoaderStatus.LOADED, data: analytics.scoreProgression },
            },
          ],
          ["m-2", { killMatrix: { status: ComponentLoaderStatus.LOADING, data: null } }],
        ]),
      });
    });
    resolveMatrix?.({ "m-1": null, "m-2": null });
    await matrix;
    await vi.waitFor(() => {
      expect(store.getSnapshot().entryStates.get("series:series-1")?.state).toMatchObject({
        analyticsByMatchId: new Map([
          [
            "m-1",
            {
              killMatrix: { status: ComponentLoaderStatus.LOADED, data: analytics.killMatrix },
              scoreProgression: { status: ComponentLoaderStatus.LOADED, data: analytics.scoreProgression },
            },
          ],
          ["m-2", { killMatrix: { status: ComponentLoaderStatus.ERROR, data: null } }],
        ]),
      });
    });
    expect(pending).toMatchObject({
      analyticsByMatchId: new Map(
        ["m-1", "m-2"].map((id) => [id, { killMatrix: { status: ComponentLoaderStatus.LOADING, data: null } }]),
      ),
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(["m-1"], ["scoreProgression"], "tracker-one");
  });

  it("retries only failed analytics chunks, deduplicating loaded and in-flight matches", async () => {
    const ids = Array.from({ length: 61 }, (_, index) => `m-${index.toString()}`);
    const { store, item, controller, matchAnalyticsService } = setupSeries(ids);
    controller.toggleEntry(item);
    await vi.waitFor(() => {
      expect(store.getSnapshot().entryStates.get("series:series-1")?.state.status).toBe("loaded");
    });
    async function fetchAnalytics(matchIds: readonly string[]): Promise<Record<string, MatchAnalytics | null>> {
      return await Promise.resolve(
        Object.fromEntries(matchIds.map((id) => [id, aFakeMatchAnalyticsWith({ killMatrix: {} })])),
      );
    }
    const spy = vi
      .spyOn(matchAnalyticsService, "getBatchMatchAnalytics")
      .mockImplementation(fetchAnalytics)
      .mockImplementationOnce(fetchAnalytics)
      .mockRejectedValueOnce(new Error("offline"));
    controller.loadAnalytics(item, "killMatrix");
    controller.loadAnalytics(item, "killMatrix");
    await vi.waitFor(() => {
      expect(store.getSnapshot().entryStates.get("series:series-1")?.state).toMatchObject({
        analyticsByMatchId: new Map(
          ids.map((id, index) => [
            id,
            {
              killMatrix: {
                status: index < 30 ? ComponentLoaderStatus.LOADED : ComponentLoaderStatus.ERROR,
                data: index < 30 ? {} : null,
              },
            },
          ]),
        ),
      });
    });
    controller.loadAnalytics(item, "killMatrix");
    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalledTimes(4);
    });
    expect(spy).toHaveBeenNthCalledWith(3, ids.slice(30, 60), ["killMatrix"], "tracker-one");
    expect(spy).toHaveBeenNthCalledWith(4, ids.slice(60), ["killMatrix"], "tracker-one");
  });

  it.each<AnalyticsModule>(["killMatrix", "scoreProgression"])(
    "retries missing and null %s records but accepts successful empty module data",
    async (module) => {
      const { store, item, controller, matchAnalyticsService } = setupSeries(["m-1", "m-2"]);
      controller.toggleEntry(item);
      await vi.waitFor(() => {
        expect(store.getSnapshot().entryStates.get("series:series-1")?.state.status).toBe("loaded");
      });
      const analytics = aFakeMatchAnalyticsWith({ requestedModules: [module], killMatrix: {}, scoreProgression: null });
      const spy = vi
        .spyOn(matchAnalyticsService, "getBatchMatchAnalytics")
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ "m-1": null })
        .mockResolvedValue({ "m-1": analytics });
      controller.loadAnalytics(item, module, "m-1");
      await vi.waitFor(() => {
        expect(store.getSnapshot().entryStates.get("series:series-1")?.state).toMatchObject({
          analyticsByMatchId: new Map([["m-1", { [module]: { status: ComponentLoaderStatus.ERROR, data: null } }]]),
        });
      });
      controller.loadAnalytics(item, module, "m-1");
      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledTimes(2);
        expect(store.getSnapshot().entryStates.get("series:series-1")?.state).toMatchObject({
          analyticsByMatchId: new Map([["m-1", { [module]: { status: ComponentLoaderStatus.ERROR, data: null } }]]),
        });
      });
      controller.loadAnalytics(item, module, "m-1");
      await vi.waitFor(() => {
        expect(store.getSnapshot().entryStates.get("series:series-1")?.state).toMatchObject({
          analyticsByMatchId: new Map([
            [
              "m-1",
              {
                [module]: {
                  status: ComponentLoaderStatus.LOADED,
                  data: analytics[module],
                },
              },
            ],
          ]),
        });
      });
      controller.loadAnalytics(item, module, "m-1");
      expect(spy).toHaveBeenCalledTimes(3);
    },
  );

  it.each<"rejected" | "missing" | "null">(["rejected", "missing", "null"])(
    "retries a skipped matrix request after a timeline request is %s",
    async (timelineResult) => {
      const { store, item, controller, matchAnalyticsService } = setupSeries(["m-1", "m-2"]);
      controller.toggleEntry(item);
      await vi.waitFor(() => {
        expect(store.getSnapshot().entryStates.get("series:series-1")?.state.status).toBe("loaded");
      });
      let resolveTimeline: ((value: Record<string, MatchAnalytics | null>) => void) | undefined;
      let rejectTimeline: ((reason: Error) => void) | undefined;
      const timeline = new Promise<Record<string, MatchAnalytics | null>>((resolve, reject) => {
        resolveTimeline = resolve;
        rejectTimeline = reject;
      });
      const analytics = aFakeMatchAnalyticsWith({ requestedModules: ["killMatrix"], killMatrix: {} });
      const spy = vi
        .spyOn(matchAnalyticsService, "getBatchMatchAnalytics")
        .mockReturnValueOnce(timeline)
        .mockResolvedValueOnce({ "m-2": analytics })
        .mockResolvedValueOnce({ "m-1": analytics });
      const presenter = new SeriesDetailStatsViewModelPresenter(new StatsDetailController());

      controller.loadAnalytics(item, "scoreProgression", "m-1");
      controller.loadAnalytics(item, "killMatrix");
      expect(spy).toHaveBeenNthCalledWith(2, ["m-2"], ["killMatrix"], "tracker-one");
      await vi.waitFor(() => {
        expect(getLoadedSeriesState(store).analyticsByMatchId.get("m-2")).toEqual({
          killMatrix: { status: ComponentLoaderStatus.LOADED, data: analytics.killMatrix },
        });
      });

      if (timelineResult === "rejected") {
        rejectTimeline?.(new Error("offline"));
      } else {
        resolveTimeline?.(timelineResult === "missing" ? {} : { "m-1": null });
      }

      await vi.waitFor(() => {
        const state = getLoadedSeriesState(store);
        expect(state.analyticsByMatchId.get("m-1")).toEqual({
          killMatrix: { status: ComponentLoaderStatus.ERROR, data: null },
          scoreProgression: { status: ComponentLoaderStatus.ERROR, data: null },
        });
        expect(state.analyticsByMatchId.get("m-2")).toEqual({
          killMatrix: { status: ComponentLoaderStatus.LOADED, data: analytics.killMatrix },
        });
        expect(presenter.present(state.data, state.analyticsByMatchId).seriesStats?.killMatrixStatus).toBe(
          ComponentLoaderStatus.ERROR,
        );
      });

      controller.loadAnalytics(item, "killMatrix");
      await vi.waitFor(() => {
        const state = getLoadedSeriesState(store);
        expect(state.analyticsByMatchId.get("m-1")).toEqual({
          killMatrix: { status: ComponentLoaderStatus.LOADED, data: analytics.killMatrix },
          scoreProgression: { status: ComponentLoaderStatus.ERROR, data: null },
        });
        expect(state.analyticsByMatchId.get("m-2")).toEqual({
          killMatrix: { status: ComponentLoaderStatus.LOADED, data: analytics.killMatrix },
        });
        expect(presenter.present(state.data, state.analyticsByMatchId).seriesStats?.killMatrixStatus).toBe(
          ComponentLoaderStatus.LOADED,
        );
      });
      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy).toHaveBeenLastCalledWith(["m-1"], ["killMatrix"], "tracker-one");
    },
  );

  it.each<"loading" | "loaded">(["loading", "loaded"])(
    "preserves an independently %s matrix when the timeline request returns null",
    async (matrixStatus) => {
      const { store, item, controller, matchAnalyticsService } = setupSeries(["m-1", "m-2"]);
      controller.toggleEntry(item);
      await vi.waitFor(() => {
        expect(store.getSnapshot().entryStates.get("series:series-1")?.state.status).toBe("loaded");
      });
      let resolveMatrix: ((value: Record<string, MatchAnalytics | null>) => void) | undefined;
      const matrix = new Promise<Record<string, MatchAnalytics | null>>((resolve) => {
        resolveMatrix = resolve;
      });
      const analytics = aFakeMatchAnalyticsWith({ requestedModules: ["killMatrix"], killMatrix: {} });
      const spy = vi
        .spyOn(matchAnalyticsService, "getBatchMatchAnalytics")
        .mockImplementation(async (_ids, modules) => {
          return modules?.includes("killMatrix") === true ? matrix : Promise.resolve({ "m-1": null });
        });

      controller.loadAnalytics(item, "killMatrix", "m-1");
      if (matrixStatus === "loaded") {
        resolveMatrix?.({ "m-1": analytics });
      }
      const expectedMatrix = {
        status: matrixStatus === "loaded" ? ComponentLoaderStatus.LOADED : ComponentLoaderStatus.LOADING,
        data: matrixStatus === "loaded" ? analytics.killMatrix : null,
      };
      await vi.waitFor(() => {
        expect(getLoadedSeriesState(store).analyticsByMatchId.get("m-1")).toEqual({
          killMatrix: expectedMatrix,
        });
      });

      controller.loadAnalytics(item, "scoreProgression", "m-1");
      await vi.waitFor(() => {
        expect(getLoadedSeriesState(store).analyticsByMatchId.get("m-1")).toEqual({
          killMatrix: expectedMatrix,
          scoreProgression: { status: ComponentLoaderStatus.ERROR, data: null },
        });
      });

      resolveMatrix?.({ "m-1": analytics });
      await vi.waitFor(() => {
        expect(getLoadedSeriesState(store).analyticsByMatchId.get("m-1")).toEqual({
          killMatrix: { status: ComponentLoaderStatus.LOADED, data: analytics.killMatrix },
          scoreProgression: { status: ComponentLoaderStatus.ERROR, data: null },
        });
      });
      expect(spy).toHaveBeenCalledTimes(2);
    },
  );

  it("marks the implicitly requested matrix retryable when a timeline fails before matrix selection", async () => {
    const { store, item, controller, matchAnalyticsService } = setupSeries(["m-1", "m-2"]);
    controller.toggleEntry(item);
    await vi.waitFor(() => {
      expect(store.getSnapshot().entryStates.get("series:series-1")?.state.status).toBe("loaded");
    });
    vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics").mockResolvedValueOnce({ "m-1": null });

    controller.loadAnalytics(item, "scoreProgression", "m-1");

    await vi.waitFor(() => {
      expect(getLoadedSeriesState(store).analyticsByMatchId.get("m-1")).toEqual({
        killMatrix: { status: ComponentLoaderStatus.ERROR, data: null },
        scoreProgression: { status: ComponentLoaderStatus.ERROR, data: null },
      });
    });
  });

  it("ignores in-flight analytics after disposal and does not request another chunk", async () => {
    const ids = Array.from({ length: 31 }, (_, index) => `m-${index.toString()}`);
    const { store, item, controller, matchAnalyticsService } = setupSeries(ids);
    controller.toggleEntry(item);
    await vi.waitFor(() => {
      expect(store.getSnapshot().entryStates.get("series:series-1")?.state.status).toBe("loaded");
    });
    let finish: ((value: Record<string, MatchAnalytics | null>) => void) | undefined;
    const request = new Promise<Record<string, MatchAnalytics | null>>((resolve) => {
      finish = resolve;
    });
    const spy = vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics").mockReturnValue(request);
    controller.loadAnalytics(item, "killMatrix");
    const pending = store.getSnapshot();
    controller.dispose();
    finish?.({});
    await request;
    expect(store.getSnapshot()).toBe(pending);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
describe("EntryDetailController condensed match loading", () => {
  it("preserves matrix success supplied by a concurrent timeline when the older matrix result is null", async () => {
    const { store, item, controller, matchAnalyticsService, key } = setup();
    controller.toggleEntry(item);
    await vi.waitFor(() => {
      expect(store.getSnapshot().entryStates.get(key)?.state.status).toBe("loaded");
    });
    let finishMatrix: ((value: Record<string, MatchAnalytics | null>) => void) | undefined;
    const matrix = new Promise<Record<string, MatchAnalytics | null>>((resolve) => {
      finishMatrix = resolve;
    });
    const analytics = aFakeMatchAnalyticsWith({ requestedModules: ["scoreProgression", "killMatrix"] });
    vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics")
      .mockReturnValueOnce(matrix)
      .mockResolvedValue({ [item.match.matchId]: analytics });
    controller.loadAnalytics(item, "killMatrix");
    controller.loadAnalytics(item, "scoreProgression");
    await vi.waitFor(() => {
      expect(store.getSnapshot().entryStates.get(key)?.state).toMatchObject({
        killMatrixStatus: ComponentLoaderStatus.LOADED,
        scoreProgressionStatus: ComponentLoaderStatus.LOADED,
      });
    });
    finishMatrix?.({ [item.match.matchId]: null });
    await matrix;
    expect(store.getSnapshot().entryStates.get(key)?.state).toMatchObject({
      killMatrixStatus: ComponentLoaderStatus.LOADED,
      scoreProgressionStatus: ComponentLoaderStatus.LOADED,
    });
  });

  it.each<AnalyticsModule>(["killMatrix", "scoreProgression"])(
    "retries missing and null %s records but accepts successful empty module data",
    async (module) => {
      const { store, item, controller, matchAnalyticsService, key } = setup();
      controller.toggleEntry(item);
      await vi.waitFor(() => {
        expect(store.getSnapshot().entryStates.get(key)?.state.status).toBe("loaded");
      });
      const analytics = aFakeMatchAnalyticsWith({ requestedModules: [module], killMatrix: {}, scoreProgression: null });
      const spy = vi
        .spyOn(matchAnalyticsService, "getBatchMatchAnalytics")
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({ [item.match.matchId]: null })
        .mockResolvedValue({ [item.match.matchId]: analytics });
      const statusField = module === "killMatrix" ? "killMatrixStatus" : "scoreProgressionStatus";
      controller.loadAnalytics(item, module);
      await vi.waitFor(() => {
        expect(store.getSnapshot().entryStates.get(key)?.state).toMatchObject({
          [statusField]: ComponentLoaderStatus.ERROR,
        });
      });
      controller.loadAnalytics(item, module);
      await vi.waitFor(() => {
        expect(spy).toHaveBeenCalledTimes(2);
        expect(store.getSnapshot().entryStates.get(key)?.state).toMatchObject({
          [statusField]: ComponentLoaderStatus.ERROR,
        });
      });
      controller.loadAnalytics(item, module);
      await vi.waitFor(() => {
        expect(store.getSnapshot().entryStates.get(key)?.state).toMatchObject({
          [statusField]: ComponentLoaderStatus.LOADED,
        });
      });
      controller.loadAnalytics(item, module);
      expect(spy).toHaveBeenCalledTimes(3);
    },
  );

  it("retries unavailable details and failed analytics while deduplicating loaded modules and expansion", async () => {
    const { store, item, controller, seriesMatchesService, matchAnalyticsService, key } = setup();
    const detailSpy = vi
      .spyOn(seriesMatchesService, "getMatchDetails")
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
    const { store, item, controller, seriesMatchesService } = setup();
    let resolveDetails: ((value: MatchDetailResponse) => void) | undefined;
    const request = new Promise<MatchDetailResponse>((resolve) => {
      resolveDetails = resolve;
    });
    vi.spyOn(seriesMatchesService, "getMatchDetails").mockReturnValue(request);
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
