import { describe, expect, it, vi } from "vitest";
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
    const presenter = new DiscordSeriesStatsPresenter({
      store,
      discordSeriesStatsService: createServiceWith(getDetail),
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      guildId: "123456789012345678",
      queueNumber: "7777",
    });

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
    const presenter = new DiscordSeriesStatsPresenter({
      store,
      discordSeriesStatsService: createServiceWith(getDetail),
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      guildId: "123456789012345678",
      queueNumber: "7777",
    });

    presenter.start();
    await vi.waitFor(() => {
      expect(getDetail).toHaveBeenCalledWith("123456789012345678", "7777");
    });
  });

  it("stores an error when the service request fails", async (): Promise<void> => {
    const store = new DiscordSeriesStatsStore();
    const presenter = new DiscordSeriesStatsPresenter({
      store,
      discordSeriesStatsService: createServiceWith(async (): Promise<never> => Promise.reject(new Error("boom"))),
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      guildId: "123456789012345678",
      queueNumber: "7777",
    });

    presenter.start();
    await vi.waitFor(() => {
      expect(store.getSnapshot()).toMatchObject({
        errorMessage: "Failed to load stats",
        loaderStatus: ComponentLoaderStatus.ERROR,
        response: null,
      });
    });
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
    const presenter = new DiscordSeriesStatsPresenter({
      store,
      discordSeriesStatsService: createServiceWith(async () =>
        Promise.resolve({
          status: 200,
          data: response,
          retryAfterSeconds: null,
        }),
      ),
      matchAnalyticsService,
      guildId: "123456789012345678",
      queueNumber: "7777",
    });

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
    expect(getBatchMatchAnalytics).toHaveBeenLastCalledWith(["match-one", "match-two"], ["killMatrix"]);
    await vi.waitFor(() => {
      expect(store.getSnapshot().analyticsByMatchId.get("match-one")).toEqual({
        scoreProgression: { status: ComponentLoaderStatus.LOADED, data: analytics.scoreProgression },
        killMatrix: {
          status: fails ? ComponentLoaderStatus.ERROR : ComponentLoaderStatus.LOADED,
          data: fails ? null : {},
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
      expect(getBatchMatchAnalytics).toHaveBeenLastCalledWith(fails ? ["match-one", "match-two"] : ["match-two"], [
        "killMatrix",
      ]);
      expect(store.getSnapshot().analyticsByMatchId.get("match-two")?.killMatrix).toEqual({
        status: fails ? ComponentLoaderStatus.LOADED : ComponentLoaderStatus.ERROR,
        data: fails ? {} : null,
      });
    });
  });
});
