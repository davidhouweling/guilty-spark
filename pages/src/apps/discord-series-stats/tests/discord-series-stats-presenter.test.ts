import { describe, expect, it, vi } from "vitest";
import type { DiscordSeriesStatsResult, DiscordSeriesStatsService } from "../../../services/stats/discord-series-types";
import { ComponentLoaderStatus } from "../../../components/component-loader/component-loader";
import { DiscordSeriesStatsPresenter } from "../discord-series-stats-presenter";
import { DiscordSeriesStatsStore } from "../discord-series-stats-store";
import { aFakeResolvedDiscordSeriesStatsWith } from "../fakes/create.fake";

function createServiceWith(getStats: DiscordSeriesStatsService["getStats"]): DiscordSeriesStatsService {
  return {
    getStats,
    getLookup: async (): Promise<{ status: number; retryAfterSeconds: number | null }> => {
      return Promise.resolve({ status: 200, retryAfterSeconds: null });
    },
  };
}

describe("DiscordSeriesStatsPresenter", () => {
  it("loads stats from the service using the guild and queue params", async (): Promise<void> => {
    const response = aFakeResolvedDiscordSeriesStatsWith();
    const getStats = vi.fn<DiscordSeriesStatsService["getStats"]>(async () => {
      return Promise.resolve<DiscordSeriesStatsResult>({
        status: 200,
        data: response,
        retryAfterSeconds: null,
      });
    });
    const store = new DiscordSeriesStatsStore();
    const presenter = new DiscordSeriesStatsPresenter({
      store,
      discordSeriesStatsService: createServiceWith(getStats),
      guildId: "123456789012345678",
      queueNumber: "7777",
    });

    presenter.start();
    await vi.waitFor(() => {
      expect(getStats).toHaveBeenCalledWith("123456789012345678", "7777");
      expect(store.getSnapshot()).toMatchObject({
        errorMessage: null,
        loaderStatus: ComponentLoaderStatus.LOADED,
        response,
      });
    });
  });

  it("stores an error when the service request fails", async (): Promise<void> => {
    const store = new DiscordSeriesStatsStore();
    const presenter = new DiscordSeriesStatsPresenter({
      store,
      discordSeriesStatsService: createServiceWith(async (): Promise<never> => Promise.reject(new Error("boom"))),
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
});
