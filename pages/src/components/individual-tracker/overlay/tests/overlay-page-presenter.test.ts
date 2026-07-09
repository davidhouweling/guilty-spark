import { describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { aFakeMatchStatsWith } from "../../../../controllers/stats/fakes/data";
import { aFakeHaloClientWith } from "../../../../services/fakes/halo-client.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../../services/stats/fakes/match-analytics.fake";
import type { ViewerTimelineItem } from "../../viewer/types";
import { OverlayPagePresenter } from "../overlay-page-presenter";
import { OverlayPageStore } from "../overlay-page-store";

function aUsersFor(
  xuids: readonly string[],
): { xuid: string; gamertag: string; gamerpic: { small: string; medium: string; large: string; xlarge: string } }[] {
  return xuids.map((xuid) => ({
    xuid,
    gamertag: `Spartan ${xuid}`,
    gamerpic: { small: "", medium: "", large: "", xlarge: "" },
  }));
}

describe("OverlayPagePresenter", () => {
  it("loads match stats and builds loaded panel state", async () => {
    const store = new OverlayPageStore();
    const getMatchStats = vi.fn(async () => Promise.resolve(aFakeMatchStatsWith({ MatchId: "match-1" })));
    const haloClient = aFakeHaloClientWith({
      getMatchStats,
      getUsers: vi.fn(async (xuids: string[]) => Promise.resolve(aUsersFor(xuids))),
    });

    const presenter = new OverlayPagePresenter({
      store,
      haloClient,
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    });

    presenter.selectMatch("match-1");

    await waitFor(() => {
      expect(store.getSnapshot().matchStatsByMatchId.get("match-1")?.status).toBe("loaded");
    });

    const model = presenter.present(store.getSnapshot());
    expect(model.selectedMatchId).toBe("match-1");
    expect(model.matchStatsState?.status).toBe("loaded");
    expect(model.matchStatsPanelState?.status).toBe("loaded");

    presenter.selectMatch("match-1");
    expect(getMatchStats).toHaveBeenCalledTimes(1);
  });

  it("maps load failures to error states", async () => {
    const store = new OverlayPageStore();
    const haloClient = aFakeHaloClientWith({
      getMatchStats: vi.fn(async () => Promise.reject(new Error("boom"))),
    });

    const presenter = new OverlayPagePresenter({
      store,
      haloClient,
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    });

    presenter.selectMatch("match-1");

    await waitFor(() => {
      expect(store.getSnapshot().matchStatsByMatchId.get("match-1")?.status).toBe("error");
    });

    const model = presenter.present(store.getSnapshot());
    expect(model.selectedMatchId).toBe("match-1");
    expect(model.matchStatsState?.status).toBe("error");
    expect(model.matchStatsPanelState?.status).toBe("error");
  });

  it("keeps loaded state when users and analytics lookups fail", async () => {
    const store = new OverlayPageStore();
    const haloClient = aFakeHaloClientWith({
      getMatchStats: vi.fn(async () => Promise.resolve(aFakeMatchStatsWith({ MatchId: "match-1" }))),
      getUsers: vi.fn(async () => Promise.reject(new Error("users down"))),
    });

    const matchAnalyticsService = aFakeMatchAnalyticsServiceWith();
    vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics").mockRejectedValue(new Error("analytics down"));

    const presenter = new OverlayPagePresenter({
      store,
      haloClient,
      matchAnalyticsService,
    });

    presenter.selectMatch("match-1");

    await waitFor(() => {
      expect(store.getSnapshot().matchStatsByMatchId.get("match-1")?.status).toBe("loaded");
    });

    const model = presenter.present(store.getSnapshot());
    expect(model.matchStatsState?.status).toBe("loaded");
    expect(model.matchStatsPanelState?.status).toBe("loaded");
  });

  it("preloads stats for all provided matches", async () => {
    const store = new OverlayPageStore();
    const getMatchStats = vi
      .fn(async (matchId: string) => Promise.resolve(aFakeMatchStatsWith({ MatchId: matchId })))
      .mockName("getMatchStats");
    const haloClient = aFakeHaloClientWith({
      getMatchStats,
      getUsers: vi.fn(async (xuids: string[]) => Promise.resolve(aUsersFor(xuids))),
    });

    const presenter = new OverlayPagePresenter({
      store,
      haloClient,
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    });

    presenter.preloadMatchStats(["match-1", "match-2", "match-3"]);

    await waitFor(() => {
      expect(store.getSnapshot().matchStatsByMatchId.get("match-1")?.status).toBe("loaded");
      expect(store.getSnapshot().matchStatsByMatchId.get("match-2")?.status).toBe("loaded");
      expect(store.getSnapshot().matchStatsByMatchId.get("match-3")?.status).toBe("loaded");
    });

    presenter.preloadMatchStats(["match-1", "match-2"]);
    expect(getMatchStats).toHaveBeenCalledTimes(3);
  });

  it("selects a series and toggles the matching timeline item when present", () => {
    const store = new OverlayPageStore();
    const presenter = new OverlayPagePresenter({
      store,
      haloClient: aFakeHaloClientWith({
        getMatchStats: vi.fn(async () => Promise.resolve(aFakeMatchStatsWith())),
      }),
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    });
    const timeline: readonly ViewerTimelineItem[] = [
      {
        type: "series",
        series: {
          id: "series-1",
          title: "Series 1",
          subtitle: "Best of 1",
          isActive: true,
          teams: [],
          matchBackgroundUrls: [],
          score: "1:0",
          duration: "10m",
          killsDeathsAssistsKda: "10:7:4 (1.62)",
          damageDealtTakenRatio: "4,200:3,900 (1.08)",
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:10:00.000Z",
          matches: [],
          colorHex: undefined,
        },
      },
    ];
    const onToggleEntry = vi.fn<(item: ViewerTimelineItem) => void>();

    presenter.selectSeriesAndToggleIfAvailable(timeline, "series-1", onToggleEntry);

    expect(store.getSnapshot().selectedSeriesId).toBe("series-1");
    expect(onToggleEntry).toHaveBeenCalledOnce();
  });

  it("clears selection with a single store notification", () => {
    const store = new OverlayPageStore();
    const presenter = new OverlayPagePresenter({
      store,
      haloClient: aFakeHaloClientWith({
        getMatchStats: vi.fn(async () => Promise.resolve(aFakeMatchStatsWith())),
      }),
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    });
    const listener = vi.fn<() => void>();
    const unsubscribe = store.subscribe(listener);

    presenter.selectSeriesAndToggleIfAvailable(null, "series-1", vi.fn<(item: ViewerTimelineItem) => void>());
    listener.mockClear();

    presenter.deselect();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().selectedMatchId).toBeNull();
    expect(store.getSnapshot().selectedSeriesId).toBeNull();
    unsubscribe();
  });
});
