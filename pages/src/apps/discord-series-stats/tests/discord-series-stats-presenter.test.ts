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
import { aFakeMatchAnalyticsServiceWith } from "../../../services/stats/fakes/match-analytics.fake";
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

  it("loads only selected analytics once and batches series kill matrix requests", async () => {
    const response = aFakeSeriesDetailResponseWith({
      matches: {
        matchIds: ["match-one", "match-two"],
        results: [
          { status: "resolved", matchId: "match-one", detail: aFakeMatchDetailWith({ matchId: "match-one" }) },
          { status: "resolved", matchId: "match-two", detail: aFakeMatchDetailWith({ matchId: "match-two" }) },
        ],
      },
    });
    const matchAnalyticsService = aFakeMatchAnalyticsServiceWith();
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
    presenter.loadAnalytics("scoreProgression", "match-one");
    await vi.waitFor(() => {
      expect(getBatchMatchAnalytics).toHaveBeenCalledTimes(1);
    });
    expect(getBatchMatchAnalytics).toHaveBeenCalledWith(["match-one"], ["scoreProgression"]);

    presenter.loadAnalytics("killMatrix");
    await vi.waitFor(() => {
      expect(getBatchMatchAnalytics).toHaveBeenCalledTimes(2);
    });
    expect(getBatchMatchAnalytics).toHaveBeenLastCalledWith(["match-one", "match-two"], ["killMatrix"]);
    await vi.waitFor(() => {
      expect(store.getSnapshot().analyticsByMatchId.get("match-one")?.killMatrix?.status).toBe(
        ComponentLoaderStatus.LOADED,
      );
      expect(store.getSnapshot().analyticsByMatchId.get("match-two")?.killMatrix?.status).toBe(
        ComponentLoaderStatus.LOADED,
      );
    });
  });
});
