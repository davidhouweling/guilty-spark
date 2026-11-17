import { describe, expect, it, vi } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import {
  aFakeMatchDetailWith,
  aFakeSeriesDetailResponseWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import type {
  DiscordSeriesStatsDetailResult,
  DiscordSeriesStatsService,
} from "../../../services/stats/discord-series-types";
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
  });
  target.presenter = presenter;
  return presenter;
}

describe("DiscordSeriesStatsPresenter", () => {
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
