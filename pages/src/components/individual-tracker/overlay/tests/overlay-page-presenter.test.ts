import type { HaloInfiniteClient } from "halo-infinite-api";
import { describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { ComponentLoaderStatus } from "../../../component-loader/component-loader";
import { aFakeMatchStatsWith } from "../../../../controllers/stats/fakes/data";
import { aFakeHaloClientWith } from "../../../../services/fakes/halo-client.fake";
import { HaloMedalMetadataResolver } from "../../../../services/halo/medal-metadata-resolver";
import { aFakeMatchAnalyticsServiceWith } from "../../../../services/stats/fakes/match-analytics.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../../services/series-matches/fakes/series-matches.fake";
import type { ViewerMatchTab, ViewerSeriesTab, ViewerTimelineItem } from "../../viewer/types";
import { aFakeViewerSeriesDetailWith } from "../../viewer/fakes/series-detail.fake";
import { OverlayPagePresenter } from "../overlay-page-presenter";
import { OverlayPageStore } from "../overlay-page-store";

function aMatchTabWith(overrides: Partial<ViewerMatchTab> = {}): ViewerMatchTab {
  return {
    matchId: "match-1",
    mapName: "Live Fire",
    mapBackgroundUrl: "https://example.com/live-fire.jpg",
    gameVariantCategory: 6,
    isMatchmaking: false,
    gameModeName: "Slayer",
    duration: "10m",
    outcome: "Win",
    score: "50:42",
    killsDeathsAssistsKda: "10:7:4 (1.62)",
    damageDealtTakenRatio: "4,200:3,900 (1.08)",
    colorHex: undefined,
    startTime: "2026-01-01T00:00:00.000Z",
    endTime: "2026-01-01T00:10:00.000Z",
    ...overrides,
  };
}

function aSeriesTabWith(overrides: Partial<ViewerSeriesTab> = {}): ViewerSeriesTab {
  return {
    id: "series-1",
    title: "Alpha vs Beta",
    subtitle: "Best of 3",
    isActive: false,
    teams: [],
    seriesOverview: { score: "1:0", matches: [], teams: [] },
    matchBackgroundUrls: [],
    score: "1:0",
    duration: "10m",
    killsDeathsAssistsKda: "10:7:4 (1.62)",
    damageDealtTakenRatio: "4,200:3,900 (1.08)",
    startTime: "2026-01-01T00:00:00.000Z",
    endTime: "2026-01-01T00:10:00.000Z",
    matches: [],
    plannedMatches: [],
    iconMatches: [],
    colorHex: undefined,
    ...overrides,
  };
}

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

function aPresenter(): OverlayPagePresenter {
  const store = new OverlayPageStore();
  const haloClient = aFakeHaloClientWith({
    getMatchStats: vi.fn(async () => Promise.resolve(aFakeMatchStatsWith())),
  });
  return new OverlayPagePresenter({
    store,
    haloClient,
    medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
    matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    seriesMatchesService: aFakeSeriesMatchesServiceWith(),
  });
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
      seriesMatchesService: aFakeSeriesMatchesServiceWith(),
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

  it("loads analytics for preloaded matches in one batch service call", async () => {
    const store = new OverlayPageStore();
    const matchAnalyticsService = aFakeMatchAnalyticsServiceWith();
    const getBatchMatchAnalytics = vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics");
    const haloClient = aFakeHaloClientWith({
      getMatchStats: vi.fn(async (matchId: string) => Promise.resolve(aFakeMatchStatsWith({ MatchId: matchId }))),
    });
    const presenter = new OverlayPagePresenter({
      store,
      haloClient,
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
      matchAnalyticsService,
      seriesMatchesService: aFakeSeriesMatchesServiceWith(),
    });
    const matchIds = Array.from({ length: 12 }, (_, index) => `match-${index.toString()}`);

    presenter.preloadMatchStats(matchIds);

    await waitFor(() => {
      expect([...store.getSnapshot().matchStatsByMatchId.values()]).toHaveLength(matchIds.length);
      expect([...store.getSnapshot().matchStatsByMatchId.values()].every((state) => state.status === "loaded")).toBe(
        true,
      );
    });
    expect(getBatchMatchAnalytics).toHaveBeenCalledOnce();
    expect(getBatchMatchAnalytics).toHaveBeenCalledWith(matchIds, ["killMatrix", "scoreProgression"], undefined);
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
      seriesMatchesService: aFakeSeriesMatchesServiceWith(),
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
      seriesMatchesService: aFakeSeriesMatchesServiceWith(),
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
      seriesMatchesService: aFakeSeriesMatchesServiceWith(),
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
      seriesMatchesService: aFakeSeriesMatchesServiceWith(),
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
      seriesMatchesService: aFakeSeriesMatchesServiceWith(),
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

  it("selects a series by id", () => {
    const store = new OverlayPageStore();
    const haloClient = aFakeHaloClientWith({
      getMatchStats: vi.fn(async () => Promise.resolve(aFakeMatchStatsWith())),
    });
    const presenter = new OverlayPagePresenter({
      store,
      haloClient,
      medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      seriesMatchesService: aFakeSeriesMatchesServiceWith(),
    });

    presenter.selectSeries("series-1");

    expect(store.getSnapshot().selectedSeriesId).toBe("series-1");
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
      seriesMatchesService: aFakeSeriesMatchesServiceWith(),
    });
    const listener = vi.fn<() => void>();
    const unsubscribe = store.subscribe(listener);

    presenter.selectSeries("series-1");
    listener.mockClear();

    presenter.deselect();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().selectedMatchId).toBeNull();
    expect(store.getSnapshot().selectedSeriesId).toBeNull();
    unsubscribe();
  });

  describe("preloadTimelineMatchStats", () => {
    it("shows match errors when the series detail request fails before or after selection", async () => {
      const store = new OverlayPageStore();
      const haloClient = aFakeHaloClientWith();
      const getMatchStats = vi.spyOn(haloClient, "getMatchStats");
      const seriesMatchesService = aFakeSeriesMatchesServiceWith();
      vi.spyOn(seriesMatchesService, "getSeriesDetail").mockRejectedValue(new Error("series unavailable"));
      const presenter = new OverlayPagePresenter({
        store,
        haloClient,
        medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
        matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
        seriesMatchesService,
      });
      const series = aSeriesTabWith({
        matches: [aMatchTabWith({ matchId: "match-1" }), aMatchTabWith({ matchId: "match-2" })],
      });
      const timeline: readonly ViewerTimelineItem[] = [{ type: "series", series }];

      presenter.preloadTimelineMatchStats(timeline);
      presenter.selectMatch("match-1", timeline);
      await waitFor(() => {
        expect(presenter.present(store.getSnapshot()).matchStatsPanelState).toEqual({
          status: "error",
          message: "Failed to load match stats",
        });
      });
      presenter.selectMatch("match-2", timeline);
      expect(presenter.present(store.getSnapshot()).matchStatsPanelState).toEqual({
        status: "error",
        message: "Failed to load match stats",
      });
      expect(getMatchStats).not.toHaveBeenCalled();
    });

    it("loads condensed series details without raw requests and loads analytics only for visible panels", async () => {
      const getMatchStats = vi
        .fn(async (matchId: string) => Promise.resolve(aFakeMatchStatsWith({ MatchId: matchId })))
        .mockName("getMatchStats");
      const store = new OverlayPageStore();
      const haloClient = aFakeHaloClientWith({
        getMatchStats,
        getUsers: vi.fn(async (xuids: string[]) => Promise.resolve(aUsersFor(xuids))),
      });
      const seriesMatchesService = aFakeSeriesMatchesServiceWith();
      const getMatchDetails = vi.spyOn(seriesMatchesService, "getMatchDetails");
      const getSeriesDetail = vi.spyOn(seriesMatchesService, "getSeriesDetail");
      const matchAnalyticsService = aFakeMatchAnalyticsServiceWith();
      const getAnalytics = vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics");
      const presenter = new OverlayPagePresenter({
        store,
        haloClient,
        medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
        matchAnalyticsService,
        seriesMatchesService,
      });
      const series = aSeriesTabWith({
        matches: [aMatchTabWith({ matchId: "series-match-1" }), aMatchTabWith({ matchId: "series-match-2" })],
      });
      const timeline: readonly ViewerTimelineItem[] = [{ type: "series", series }];

      presenter.preloadTimelineMatchStats(timeline);
      expect(getAnalytics).not.toHaveBeenCalled();

      await waitFor(() => {
        expect(store.getSnapshot().matchStatsByMatchId.get("series-match-1")?.status).toBe("condensed");
        expect(store.getSnapshot().matchStatsByMatchId.get("series-match-2")?.status).toBe("condensed");
        expect(store.getSnapshot().seriesDetailsById.get("series-1")?.status).toBe("loaded");
      });
      expect(getMatchStats).not.toHaveBeenCalled();
      expect(getMatchDetails).not.toHaveBeenCalled();
      expect(getSeriesDetail).toHaveBeenCalledOnce();
      expect(getSeriesDetail).toHaveBeenCalledWith(
        "series-1",
        ["series-match-1", "series-match-2"],
        undefined,
        "substitution-aware",
      );
      expect(getAnalytics).not.toHaveBeenCalled();
      presenter.selectSeries("series-1");
      presenter.loadSeriesAnalytics("series-1", "killMatrix");
      await waitFor(() => {
        expect(getAnalytics).toHaveBeenCalledOnce();
      });
      expect(getAnalytics).toHaveBeenCalledWith(["series-match-1", "series-match-2"], ["killMatrix"]);
      presenter.selectMatch("series-match-1", timeline);
      await waitFor(() => {
        expect(getAnalytics).toHaveBeenCalledTimes(2);
      });
      expect(getAnalytics).toHaveBeenLastCalledWith(["series-match-1"], ["scoreProgression"]);
      expect(presenter.buildSeriesStatsPanelState(series, store.getSnapshot().seriesDetailsById)?.status).toBe(
        "loaded",
      );
    });

    it("keeps standalone tables and ticker data available when analytics fails", async () => {
      const store = new OverlayPageStore();
      const haloClient = aFakeHaloClientWith();
      const seriesMatchesService = aFakeSeriesMatchesServiceWith();
      const getMatchDetails = vi.spyOn(seriesMatchesService, "getMatchDetails");
      const matchAnalyticsService = aFakeMatchAnalyticsServiceWith();
      const getAnalytics = vi
        .spyOn(matchAnalyticsService, "getBatchMatchAnalytics")
        .mockRejectedValue(new Error("analytics down"));
      const presenter = new OverlayPagePresenter({
        store,
        haloClient,
        medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
        matchAnalyticsService,
        seriesMatchesService,
        trackerId: "tracker-1",
      });

      const timeline: readonly ViewerTimelineItem[] = [
        { type: "match", match: aMatchTabWith() },
        { type: "match", match: aMatchTabWith({ matchId: "match-2" }) },
      ];
      presenter.preloadTimelineMatchStats(timeline);
      await waitFor(() => {
        expect(store.getSnapshot().matchStatsByMatchId.get("match-1")?.status).toBe("condensed");
        expect(store.getSnapshot().matchStatsByMatchId.get("match-2")?.status).toBe("condensed");
      });
      expect(getAnalytics).not.toHaveBeenCalled();
      presenter.selectMatch("match-1", timeline);
      presenter.selectMatch("match-1", timeline);
      await waitFor(() => {
        const panel = presenter.present(store.getSnapshot()).matchStatsPanelState;
        if (panel?.status !== "loaded") {
          throw new Error("expected loaded panel");
        }
        expect(panel.data[0]?.players[0]?.name).toBe("Spartan One");
        expect(panel.killMatrixStatus).toBe(ComponentLoaderStatus.ERROR);
        expect(panel.scoreProgressionStatus).toBe(ComponentLoaderStatus.ERROR);
      });
      expect(getMatchDetails).toHaveBeenCalledTimes(2);
      expect(getMatchDetails).toHaveBeenCalledWith(["match-1"], "tracker-1");
      expect(getAnalytics).toHaveBeenCalledOnce();
      expect(getAnalytics).toHaveBeenCalledWith(["match-1"], ["killMatrix", "scoreProgression"], "tracker-1");
    });

    it("ignores a stale standalone response after a match joins a series", async () => {
      const store = new OverlayPageStore();
      const getMatchStats = vi.fn(async () => Promise.resolve(aFakeMatchStatsWith({ MatchId: "match-1" })));
      const haloClient = aFakeHaloClientWith({ getMatchStats });
      const seriesMatchesService = aFakeSeriesMatchesServiceWith();
      const response = await seriesMatchesService.getMatchDetails(["match-1"]);
      let resolveDetails: ((value: typeof response) => void) | undefined;
      vi.spyOn(seriesMatchesService, "getMatchDetails").mockImplementation(
        async () =>
          new Promise((resolve) => {
            resolveDetails = resolve;
          }),
      );
      const presenter = new OverlayPagePresenter({
        store,
        haloClient,
        medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
        matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
        seriesMatchesService,
      });
      const match = aMatchTabWith();
      presenter.preloadTimelineMatchStats([{ type: "match", match }]);
      presenter.preloadTimelineMatchStats([{ type: "series", series: aSeriesTabWith({ matches: [match] }) }]);
      await waitFor(() => {
        expect(store.getSnapshot().matchStatsByMatchId.get("match-1")?.status).toBe("condensed");
      });
      resolveDetails?.(response);
      await Promise.resolve();
      expect(store.getSnapshot().matchStatsByMatchId.get("match-1")?.status).toBe("condensed");
      expect(getMatchStats).not.toHaveBeenCalled();
    });

    it("does not load analytics when selection closes before detail resolves", async () => {
      const store = new OverlayPageStore();
      const haloClient = aFakeHaloClientWith();
      const matchAnalyticsService = aFakeMatchAnalyticsServiceWith();
      const getAnalytics = vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics");
      const seriesMatchesService = aFakeSeriesMatchesServiceWith();
      const response = await seriesMatchesService.getMatchDetails(["match-1"]);
      let resolveDetails: ((value: typeof response) => void) | undefined;
      vi.spyOn(seriesMatchesService, "getMatchDetails").mockImplementation(
        async () =>
          new Promise((resolve) => {
            resolveDetails = resolve;
          }),
      );
      const presenter = new OverlayPagePresenter({
        store,
        haloClient,
        medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
        matchAnalyticsService,
        seriesMatchesService,
      });
      const timeline: readonly ViewerTimelineItem[] = [{ type: "match", match: aMatchTabWith() }];
      presenter.preloadTimelineMatchStats(timeline);
      presenter.selectMatch("match-1", timeline);
      presenter.deselect();
      resolveDetails?.(response);
      await waitFor(() => {
        expect(store.getSnapshot().matchStatsByMatchId.get("match-1")?.status).toBe("condensed");
      });
      expect(getAnalytics).not.toHaveBeenCalled();
    });

    it("reports unavailable standalone details as an error without a raw fallback", async () => {
      const store = new OverlayPageStore();
      const haloClient = aFakeHaloClientWith();
      const rawFetch = vi.spyOn(haloClient, "getMatchStats");
      const seriesMatchesService = aFakeSeriesMatchesServiceWith();
      vi.spyOn(seriesMatchesService, "getMatchDetails").mockResolvedValue({
        matchIds: ["match-1"],
        results: [{ status: "unavailable", matchId: "match-1", reason: "forbidden" }],
      });
      const presenter = new OverlayPagePresenter({
        store,
        haloClient,
        medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
        matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
        seriesMatchesService,
      });

      presenter.selectMatch("match-1", [{ type: "match", match: aMatchTabWith() }]);
      await waitFor(() => {
        expect(presenter.present(store.getSnapshot()).matchStatsPanelState).toEqual({
          status: "error",
          message: "Failed to load match stats",
        });
      });
      expect(rawFetch).not.toHaveBeenCalled();
    });

    it("renders standalone tables before analytics and ignores analytics after reset", async () => {
      const store = new OverlayPageStore();
      const haloClient = aFakeHaloClientWith();
      const matchAnalyticsService = aFakeMatchAnalyticsServiceWith();
      let resolveAnalytics: ((value: Record<string, null>) => void) | undefined;
      vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics").mockImplementation(
        async () =>
          new Promise((resolve) => {
            resolveAnalytics = resolve;
          }),
      );
      const presenter = new OverlayPagePresenter({
        store,
        haloClient,
        medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
        matchAnalyticsService,
        seriesMatchesService: aFakeSeriesMatchesServiceWith(),
      });

      presenter.selectMatch("match-1", [{ type: "match", match: aMatchTabWith() }]);
      await waitFor(() => {
        const panel = presenter.present(store.getSnapshot()).matchStatsPanelState;
        if (panel?.status !== "loaded") {
          throw new Error("expected loaded panel");
        }
        expect(panel.data[0]?.players[0]?.name).toBe("Spartan One");
        expect(panel.scoreProgressionStatus).toBe(ComponentLoaderStatus.LOADING);
      });
      presenter.reset();
      resolveAnalytics?.({ "match-1": null });
      await Promise.resolve();
      expect(store.getSnapshot().matchStatsByMatchId.size).toBe(0);
    });
  });

  describe("findSelectedMatch", () => {
    it("returns null when no match is selected", () => {
      expect(aPresenter().findSelectedMatch([], null)).toBeNull();
    });

    it("finds a standalone match tab by id", () => {
      const match = aMatchTabWith({ matchId: "match-1" });
      const timeline: readonly ViewerTimelineItem[] = [{ type: "match", match }];

      expect(aPresenter().findSelectedMatch(timeline, "match-1")).toBe(match);
    });

    it("finds a match nested inside a series entry", () => {
      const seriesMatch = aMatchTabWith({ matchId: "series-match-1" });
      const timeline: readonly ViewerTimelineItem[] = [
        { type: "series", series: aSeriesTabWith({ matches: [seriesMatch] }) },
      ];

      expect(aPresenter().findSelectedMatch(timeline, "series-match-1")).toBe(seriesMatch);
    });

    it("returns null when the selected match id isn't in the timeline", () => {
      const timeline: readonly ViewerTimelineItem[] = [{ type: "match", match: aMatchTabWith({ matchId: "match-1" }) }];

      expect(aPresenter().findSelectedMatch(timeline, "missing")).toBeNull();
    });
  });

  describe("findSelectedSeries", () => {
    it("returns null when no series is selected", () => {
      expect(aPresenter().findSelectedSeries([], null)).toBeNull();
    });

    it("finds a series entry by id", () => {
      const series = aSeriesTabWith({ id: "series-1" });
      const timeline: readonly ViewerTimelineItem[] = [{ type: "series", series }];

      expect(aPresenter().findSelectedSeries(timeline, "series-1")).toBe(series);
    });

    it("returns null when the selected series id isn't in the timeline", () => {
      const timeline: readonly ViewerTimelineItem[] = [{ type: "series", series: aSeriesTabWith({ id: "series-1" }) }];

      expect(aPresenter().findSelectedSeries(timeline, "missing")).toBeNull();
    });
  });

  describe("buildSeriesStatsPanelState", () => {
    it("returns null when there is no selected series", () => {
      expect(aPresenter().buildSeriesStatsPanelState(null, new Map())).toBeNull();
    });

    it("returns null when the series has no matches yet", () => {
      const series = aSeriesTabWith({ matches: [] });

      expect(aPresenter().buildSeriesStatsPanelState(series, new Map())).toBeNull();
    });

    it("returns loading while condensed series details are pending", () => {
      const series = aSeriesTabWith({ matches: [aMatchTabWith({ matchId: "match-1" })] });
      const seriesDetailsById = new Map([["series-1", { status: "loading" as const }]]);

      expect(aPresenter().buildSeriesStatsPanelState(series, seriesDetailsById)).toEqual({ status: "loading" });
    });

    it("returns the series detail error", () => {
      const series = aSeriesTabWith({ matches: [aMatchTabWith({ matchId: "match-1" })] });
      const seriesDetailsById = new Map([["series-1", { status: "error" as const, message: "Failed to load series" }]]);

      expect(aPresenter().buildSeriesStatsPanelState(series, seriesDetailsById)).toEqual({
        status: "error",
        message: "Failed to load series",
      });
    });

    it("preserves match details while marking ambiguous series totals unavailable", () => {
      const series = aSeriesTabWith({
        title: "Alpha vs Beta",
        subtitle: "Best of 3",
        matches: [aMatchTabWith({ matchId: "match-1" })],
      });
      const response = aFakeViewerSeriesDetailWith(["match-1"], {
        aggregation: { status: "unavailable", reason: "ambiguous-team-mapping" },
      });
      const seriesDetailsById = new Map([
        [
          "series-1",
          { status: "loaded" as const, seriesId: "series-1", data: response, analyticsByMatchId: new Map() },
        ],
      ]);

      const state = aPresenter().buildSeriesStatsPanelState(series, seriesDetailsById);

      expect(state?.status).toBe("loaded");
      if (state?.status !== "loaded") {
        throw new Error("expected loaded series stats state");
      }
      expect(state.seriesId).toBe("series-1");
      expect(state.viewModel.title).toBe("Alpha vs Beta");
      expect(state.viewModel.subtitle).toBe("Best of 3");
      expect(state.viewModel.seriesScore).toBe("Unavailable");
      expect(state.viewModel.seriesStats).toBeNull();
      expect(state.viewModel.seriesStatsWarning).toContain("team identities could not be matched reliably");
      expect(state.viewModel.matchDetails[0]?.data).not.toBeNull();
    });
  });
});
