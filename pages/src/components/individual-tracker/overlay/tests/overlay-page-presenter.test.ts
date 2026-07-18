import type { HaloInfiniteClient } from "halo-infinite-api";
import { describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { ComponentLoaderStatus } from "../../../component-loader/component-loader";
import { aFakeMatchStatsWith } from "../../../../controllers/stats/fakes/data";
import { aFakeHaloClientWith } from "../../../../services/fakes/halo-client.fake";
import { HaloMedalMetadataResolver } from "../../../../services/halo/medal-metadata-resolver";
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

function aMedalsMetadataFile(): Awaited<ReturnType<HaloInfiniteClient["getMedalsMetadataFile"]>> {
  return {
    difficulties: ["normal", "heroic", "legendary", "mythic"],
    types: ["spree", "mode", "multikill", "proficiency", "skill", "style"],
    sprites: {
      small: { path: "small.png", columns: 16, size: 72 },
      medium: { path: "medium.png", columns: 16, size: 128 },
      "extra-large": { path: "large.png", columns: 16, size: 256 },
    },
    medals: [
      {
        name: { value: "Killing Spree", translations: {} },
        description: { value: "Kill 5 enemies without dying", translations: {} },
        spriteIndex: 1,
        sortingWeight: 100,
        difficultyIndex: 1,
        typeIndex: 0,
        personalScore: 10,
        nameId: 622331684,
      },
      {
        name: { value: "Double Kill", translations: {} },
        description: { value: "Kill 2 enemies in quick succession", translations: {} },
        spriteIndex: 2,
        sortingWeight: 50,
        difficultyIndex: 1,
        typeIndex: 2,
        personalScore: 10,
        nameId: 1169571763,
      },
    ],
  };
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
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
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
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
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
      getMedalsMetadataFile: vi.fn(async () => Promise.reject(new Error("medals down"))),
    });

    const matchAnalyticsService = aFakeMatchAnalyticsServiceWith();
    vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics").mockRejectedValue(new Error("analytics down"));

    const presenter = new OverlayPagePresenter({
      store,
      haloClient,
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
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

  it("loads overlay stats before analytics resolves", async () => {
    const store = new OverlayPageStore();
    const haloClient = aFakeHaloClientWith({
      getMatchStats: vi.fn(async () => Promise.resolve(aFakeMatchStatsWith({ MatchId: "match-1" }))),
      getUsers: vi.fn(async (xuids: string[]) => Promise.resolve(aUsersFor(xuids))),
    });

    const matchAnalyticsService = aFakeMatchAnalyticsServiceWith();
    let resolveAnalytics: ((value: Record<string, null>) => void) | undefined;
    const analyticsPromise = new Promise<Record<string, null>>((resolve) => {
      resolveAnalytics = resolve;
    });
    vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics").mockImplementation(async () => analyticsPromise);

    const presenter = new OverlayPagePresenter({
      store,
      haloClient,
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
      matchAnalyticsService,
    });

    presenter.selectMatch("match-1");

    await waitFor(() => {
      const state = store.getSnapshot().matchStatsByMatchId.get("match-1");
      expect(state?.status).toBe("loaded");
      if (state?.status === "loaded") {
        expect(state.analyticsStatus).toBe(ComponentLoaderStatus.LOADING);
      }
    });

    resolveAnalytics?.({ "match-1": null });

    await waitFor(() => {
      const state = store.getSnapshot().matchStatsByMatchId.get("match-1");
      expect(state?.status).toBe("loaded");
      if (state?.status === "loaded") {
        expect(state.analyticsStatus).toBe(ComponentLoaderStatus.LOADED);
      }
    });
  });

  it("resolves medal metadata from the proxied medals file and caches it across loads", async () => {
    const store = new OverlayPageStore();
    const getMedalsMetadataFile = vi.fn(async () => Promise.resolve(aMedalsMetadataFile()));
    const haloClient = aFakeHaloClientWith({
      getMatchStats: vi.fn(async (matchId: string) => Promise.resolve(aFakeMatchStatsWith({ MatchId: matchId }))),
      getUsers: vi.fn(async (xuids: string[]) => Promise.resolve(aUsersFor(xuids))),
      getMedalsMetadataFile,
    });

    const presenter = new OverlayPagePresenter({
      store,
      haloClient,
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    });

    presenter.preloadMatchStats(["match-1", "match-2"]);

    await waitFor(() => {
      expect(store.getSnapshot().matchStatsByMatchId.get("match-1")?.status).toBe("loaded");
      expect(store.getSnapshot().matchStatsByMatchId.get("match-2")?.status).toBe("loaded");
    });

    const firstState = store.getSnapshot().matchStatsByMatchId.get("match-1");
    expect(firstState).toMatchObject({ status: "loaded" });
    if (firstState?.status !== "loaded") {
      throw new Error("expected loaded overlay match stats state");
    }

    expect(firstState.medalMetadata).toEqual({
      622331684: { name: "Killing Spree", sortingWeight: 100 },
      1169571763: { name: "Double Kill", sortingWeight: 50 },
    });
    expect(getMedalsMetadataFile).toHaveBeenCalledTimes(1);
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
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
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
    const haloClient = aFakeHaloClientWith({
      getMatchStats: vi.fn(async () => Promise.resolve(aFakeMatchStatsWith())),
    });
    const presenter = new OverlayPagePresenter({
      store,
      haloClient,
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
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
    const haloClient = aFakeHaloClientWith({
      getMatchStats: vi.fn(async () => Promise.resolve(aFakeMatchStatsWith())),
    });
    const presenter = new OverlayPagePresenter({
      store,
      haloClient,
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
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
