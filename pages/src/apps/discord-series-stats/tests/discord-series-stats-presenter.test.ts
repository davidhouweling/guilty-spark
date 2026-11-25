import { afterEach, describe, expect, it, vi } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import {
  aFakeMatchDetailWith,
  aFakeSeriesDetailResponseWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import type {
  DiscordSeriesStatsDetailResult,
  DiscordSeriesStatsService,
} from "../../../services/stats/discord-series-types";
import { DEFAULT_ALL_SETTINGS } from "../../../components/live-tracker/settings/types";
import type { AllStreamerSettings } from "../../../components/live-tracker/settings/types";
import { aFakeDiscordSeriesStatsServiceWith } from "../../../services/stats/fakes/discord-series.fake";
import { ComponentLoaderStatus } from "../../../components/component-loader/component-loader";
import { SeriesAnalyticsController } from "../../../controllers/series-analytics/series-analytics-controller";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import {
  aFakeCtfMatchAnalyticsWith,
  aFakeMatchAnalyticsServiceWith,
} from "../../../services/stats/fakes/match-analytics.fake";
import { DiscordSeriesStatsPresenter } from "../discord-series-stats-presenter";
import { DiscordSeriesStatsStore } from "../discord-series-stats-store";

function createServiceWith(getDetail: DiscordSeriesStatsService["getDetail"]): DiscordSeriesStatsService {
  const service: DiscordSeriesStatsService = aFakeDiscordSeriesStatsServiceWith();
  vi.spyOn(service, "getDetail").mockImplementation(getDetail);
  return service;
}

function createPresenter(
  store: DiscordSeriesStatsStore,
  discordSeriesStatsService: DiscordSeriesStatsService,
  matchAnalyticsService: MatchAnalyticsService = aFakeMatchAnalyticsServiceWith(),
  settings: AllStreamerSettings = DEFAULT_ALL_SETTINGS,
  updateGlobalSettings: (settings: Partial<AllStreamerSettings["global"]>) => void = vi.fn(),
): DiscordSeriesStatsPresenter {
  const target: { presenter?: DiscordSeriesStatsPresenter | undefined } = {};
  const analyticsController = new SeriesAnalyticsController({
    matchAnalyticsService,
    onChange: (analyticsByMatchId): void => {
      Preconditions.checkExists(target.presenter, "Analytics presenter is not initialized").setAnalytics(
        analyticsByMatchId,
      );
    },
  });
  const presenter = new DiscordSeriesStatsPresenter({
    store,
    discordSeriesStatsService,
    analyticsController,
    guildId: "123456789012345678",
    queueNumber: "7777",
    settings,
    updateGlobalSettings,
  });
  target.presenter = presenter;
  return presenter;
}

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("DiscordSeriesStatsPresenter", () => {
  it("initializes display settings from the URL", (): void => {
    window.history.replaceState({ marker: "kept" }, "", "/?viewMode=standard&title=Finals&campaign=summer#match-one");
    const store = new DiscordSeriesStatsStore();
    const presenter = createPresenter(store, aFakeDiscordSeriesStatsServiceWith());

    presenter.start();

    expect(store.getSnapshot()).toMatchObject({
      seriesSettings: { titleOverride: "Finals" },
      viewMode: "standard",
    });
  });

  it("updates series settings and view mode while preserving unrelated URL state", (): void => {
    window.history.replaceState({ marker: "kept" }, "", "/?subtitle=Season+1&campaign=summer#match-one");
    const store = new DiscordSeriesStatsStore();
    const presenter = createPresenter(store, aFakeDiscordSeriesStatsServiceWith());
    presenter.start();

    presenter.setSeriesSettings({ titleOverride: "Championship" });
    presenter.setViewMode("streamer");

    const url = new URL(window.location.href);
    expect(store.getSnapshot()).toMatchObject({
      seriesSettings: { titleOverride: "Championship", subtitleOverride: "Season 1" },
      viewMode: "streamer",
    });

    expect(url.searchParams.get("title")).toBe("Championship");
    expect(url.searchParams.get("subtitle")).toBe("Season 1");
    expect(url.searchParams.get("viewMode")).toBe("streamer");
    expect(url.searchParams.get("campaign")).toBe("summer");
    expect(url.hash).toBe("#match-one");
    expect(window.history.state).toEqual({ marker: "kept" });
  });

  it("preserves sequential display edits without persisting untouched URL overrides", (): void => {
    window.history.replaceState({}, "", "/?showTitle=false&campaign=summer");
    const store = new DiscordSeriesStatsStore();
    const save = vi.fn<(settings: Partial<AllStreamerSettings["global"]>) => void>();
    const presenter = createPresenter(
      store,
      aFakeDiscordSeriesStatsServiceWith(),
      undefined,
      DEFAULT_ALL_SETTINGS,
      save,
    );
    presenter.start();

    presenter.setGlobalSettings({ display: { showScore: false } });
    presenter.setGlobalSettings({ display: { showXboxNames: false } });

    expect(store.getSnapshot().urlSettings.global.display).toMatchObject({
      showTitle: false,
      showScore: false,
      showXboxNames: false,
    });
    expect(save).toHaveBeenLastCalledWith({
      display: { ...DEFAULT_ALL_SETTINGS.global.display, showScore: false, showXboxNames: false },
    });
    expect(window.location.search).toContain("campaign=summer");
  });

  it("updates both colors without persisting an untouched URL override", (): void => {
    window.history.replaceState({ marker: "kept" }, "", "/?eagleColor=carrot&campaign=summer#match-one");
    const store = new DiscordSeriesStatsStore();
    const save = vi.fn<(settings: Partial<AllStreamerSettings["global"]>) => void>();
    const presenter = createPresenter(
      store,
      aFakeDiscordSeriesStatsServiceWith(),
      undefined,
      DEFAULT_ALL_SETTINGS,
      save,
    );
    presenter.start();

    presenter.setObserverColors({ cobraColor: "sky" });
    expect(store.getSnapshot().observerColors).toEqual({ eagleColor: "carrot", cobraColor: "sky" });
    expect(save).toHaveBeenLastCalledWith({
      colors: { ...DEFAULT_ALL_SETTINGS.global.colors, observerView: { eagleColor: "salmon", cobraColor: "sky" } },
    });

    presenter.setObserverColors({ eagleColor: "jade" });
    expect(store.getSnapshot().observerColors).toEqual({ eagleColor: "jade", cobraColor: "sky" });
    expect(save).toHaveBeenLastCalledWith({
      colors: { ...DEFAULT_ALL_SETTINGS.global.colors, observerView: { eagleColor: "jade", cobraColor: "sky" } },
    });
    expect(window.location.search).toBe("?eagleColor=jade&campaign=summer&cobraColor=sky");
    expect(window.location.hash).toBe("#match-one");
    expect(window.history.state).toEqual({ marker: "kept" });
  });

  it("loads stats from the service using the guild and queue params", async (): Promise<void> => {
    const response = aFakeSeriesDetailResponseWith();
    const getDetail = vi.fn<DiscordSeriesStatsService["getDetail"]>(async () => {
      return Promise.resolve<DiscordSeriesStatsDetailResult>({
        status: 200,
        data: response,
        retryAfterSeconds: null,
      });
    });
    const store = new DiscordSeriesStatsStore();
    const presenter = createPresenter(store, createServiceWith(getDetail));

    presenter.start();
    await vi.waitFor(() => {
      expect(getDetail).toHaveBeenCalledWith("123456789012345678", "7777");
      expect(store.getSnapshot()).toMatchObject({
        errorMessage: null,
        loaderStatus: ComponentLoaderStatus.LOADED,
        response,
      });
      expect(DiscordSeriesStatsPresenter.present(store.getSnapshot())).toEqual({
        state: "resolved",
        data: response,
      });
    });
  });

  it("loads manual series using the queue number", async (): Promise<void> => {
    const response = aFakeSeriesDetailResponseWith();
    const getDetail = vi.fn<DiscordSeriesStatsService["getDetail"]>(async () =>
      Promise.resolve<DiscordSeriesStatsDetailResult>({
        status: 200,
        data: response,
        retryAfterSeconds: null,
      }),
    );
    const store = new DiscordSeriesStatsStore();
    const presenter = createPresenter(store, createServiceWith(getDetail));

    presenter.start();
    await vi.waitFor(() => {
      expect(getDetail).toHaveBeenCalledWith("123456789012345678", "7777");
    });
  });

  it("stores an error when the service request fails", async (): Promise<void> => {
    const store = new DiscordSeriesStatsStore();
    const presenter = createPresenter(
      store,
      createServiceWith(async (): Promise<never> => Promise.reject(new Error("boom"))),
    );

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot()).toMatchObject({
        errorMessage: "Failed to load stats",
        loaderStatus: ComponentLoaderStatus.ERROR,
        response: null,
      });
    });
  });

  it("ignores analytics from an earlier detail load after restart", async () => {
    const response = aFakeSeriesDetailResponseWith({
      matches: {
        matchIds: ["match-one"],
        results: [{ status: "resolved", matchId: "match-one", detail: aFakeMatchDetailWith({ matchId: "match-one" }) }],
      },
    });
    const service: MatchAnalyticsService = aFakeMatchAnalyticsServiceWith();
    let finish: (value: Awaited<ReturnType<MatchAnalyticsService["getBatchMatchAnalytics"]>>) => void = () => {
      throw new Error("Promise resolver unavailable");
    };
    vi.spyOn(service, "getBatchMatchAnalytics").mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const store = new DiscordSeriesStatsStore();
    const presenter = createPresenter(
      store,
      createServiceWith(async () =>
        Promise.resolve({
          status: 200,
          data: response,
          retryAfterSeconds: null,
        }),
      ),
      service,
    );
    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().loaderStatus).toBe(ComponentLoaderStatus.LOADED);
    });
    presenter.loadAnalytics("killMatrix");
    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().loaderStatus).toBe(ComponentLoaderStatus.LOADED);
    });
    finish({ "match-one": aFakeCtfMatchAnalyticsWith() });
    await Promise.resolve();
    expect(store.getSnapshot().analyticsByMatchId.size).toBe(0);
  });

  it.each([
    { fails: false, timeline: true },
    { fails: false, timeline: false },
    { fails: true, timeline: true },
  ])("preserves module state and retries failed matches with %j", async ({ fails, timeline }) => {
    const response = aFakeSeriesDetailResponseWith({
      matches: {
        matchIds: ["match-one", "match-two"],
        results: [
          { status: "resolved", matchId: "match-one", detail: aFakeMatchDetailWith({ matchId: "match-one" }) },
          { status: "resolved", matchId: "match-two", detail: aFakeMatchDetailWith({ matchId: "match-two" }) },
        ],
      },
    });
    const analytics = aFakeCtfMatchAnalyticsWith({
      killMatrix: {},
      scoreProgression: timeline ? aFakeCtfMatchAnalyticsWith().scoreProgression : null,
    });
    const matchAnalyticsService = aFakeMatchAnalyticsServiceWith({ analytics, failMatchIds: ["match-two"] });
    const getBatchMatchAnalytics = vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics");
    const store = new DiscordSeriesStatsStore();
    const presenter = createPresenter(
      store,
      createServiceWith(async () =>
        Promise.resolve({
          status: 200,
          data: response,
          retryAfterSeconds: null,
        }),
      ),
      matchAnalyticsService,
    );

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot().loaderStatus).toBe(ComponentLoaderStatus.LOADED);
    });

    presenter.loadAnalytics("scoreProgression", "match-one");
    const loadingSnapshot = store.getSnapshot();
    expect(loadingSnapshot.analyticsByMatchId.get("match-one")?.scoreProgression).toEqual({
      status: ComponentLoaderStatus.LOADING,
      data: null,
    });
    presenter.loadAnalytics("scoreProgression", "match-one");
    await vi.waitFor(() => {
      expect(getBatchMatchAnalytics).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot().analyticsByMatchId.get("match-one")?.scoreProgression?.status).toBe(
        ComponentLoaderStatus.LOADED,
      );
    });
    expect(getBatchMatchAnalytics).toHaveBeenCalledWith(["match-one"], ["scoreProgression"]);

    if (fails) {
      getBatchMatchAnalytics.mockRejectedValueOnce(new Error("Analytics request failed"));
    }
    presenter.loadAnalytics("killMatrix");
    expect(store.getSnapshot().analyticsByMatchId.get("match-two")?.killMatrix).toEqual({
      status: ComponentLoaderStatus.LOADING,
      data: null,
    });
    await vi.waitFor(() => {
      expect(getBatchMatchAnalytics).toHaveBeenCalledTimes(2);
    });
    expect(getBatchMatchAnalytics).toHaveBeenLastCalledWith(["match-two"], ["killMatrix"]);
    await vi.waitFor(() => {
      expect(store.getSnapshot().analyticsByMatchId.get("match-one")).toEqual({
        scoreProgression: { status: ComponentLoaderStatus.LOADED, data: analytics.scoreProgression },
        killMatrix: {
          status: ComponentLoaderStatus.LOADED,
          data: {},
        },
      });
      expect(store.getSnapshot().analyticsByMatchId.get("match-two")?.killMatrix).toEqual({
        status: ComponentLoaderStatus.ERROR,
        data: null,
      });
    });
    expect(loadingSnapshot.analyticsByMatchId.get("match-one")?.scoreProgression?.status).toBe(
      ComponentLoaderStatus.LOADING,
    );
    getBatchMatchAnalytics.mockResolvedValueOnce(fails ? { "match-one": analytics, "match-two": analytics } : {});
    presenter.loadAnalytics("killMatrix");
    await vi.waitFor(() => {
      expect(getBatchMatchAnalytics).toHaveBeenLastCalledWith(["match-two"], ["killMatrix"]);
      expect(store.getSnapshot().analyticsByMatchId.get("match-two")?.killMatrix).toEqual({
        status: fails ? ComponentLoaderStatus.LOADED : ComponentLoaderStatus.ERROR,
        data: fails ? {} : null,
      });
    });
  });
});
