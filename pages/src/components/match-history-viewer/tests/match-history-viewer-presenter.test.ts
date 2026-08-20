import { describe, expect, it, vi } from "vitest";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import {
  aFakeIndividualTrackerServiceWith,
  aFakeMatchHistoryEntryWith,
  aFakeTrackerSearchResultWith,
} from "../../../services/individual-tracker/fakes/individual-tracker.fake";
import { aFakeIndividualTrackerSettingsServiceWith } from "../../../services/individual-tracker/fakes/settings.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../services/stats/fakes/match-analytics.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../services/stats/fakes/series-matches.fake";
import { aFakeHaloClientWith } from "../../../services/fakes/halo-client.fake";
import { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import { IndividualTrackerViewerStore } from "../../individual-tracker/viewer/viewer-store";
import { MatchHistoryViewerPresenter } from "../match-history-viewer-presenter";

const MATCH_PAGE_SIZE = 25;

function aFullPageOfEntries(prefix: string, count = MATCH_PAGE_SIZE): ReturnType<typeof aFakeMatchHistoryEntryWith>[] {
  return Array.from({ length: count }, (_, index) =>
    aFakeMatchHistoryEntryWith({
      matchId: `${prefix}-${index.toString()}`,
      startTimeIso: new Date(2026, 0, 1, 0, index).toISOString(),
      rawMatchStats: null,
    }),
  );
}

function aPresenterSetup(settings: Parameters<typeof aFakeIndividualTrackerSettingsServiceWith>[0] = {}): {
  presenter: MatchHistoryViewerPresenter;
  viewerStore: IndividualTrackerViewerStore;
  individualTrackerService: ReturnType<typeof aFakeIndividualTrackerServiceWith>;
} {
  const individualTrackerService = aFakeIndividualTrackerServiceWith();
  const viewerStore = new IndividualTrackerViewerStore();
  const haloClient = aFakeHaloClientWith();

  const presenter = new MatchHistoryViewerPresenter({
    individualTrackerService,
    individualTrackerSettingsService: aFakeIndividualTrackerSettingsServiceWith(settings),
    matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    seriesMatchesService: aFakeSeriesMatchesServiceWith(),
    medalMetadataResolver: new HaloMedalMetadataResolver(haloClient),
    viewerStore,
  });

  return { presenter, viewerStore, individualTrackerService };
}

describe("MatchHistoryViewerPresenter", () => {
  it("resolves the gamertag and loads the first page of match history", async () => {
    const { presenter, viewerStore, individualTrackerService } = aPresenterSetup();
    const searchResult = aFakeTrackerSearchResultWith({ gamertag: "Master Chief", xuid: "xuid-1" });
    vi.spyOn(individualTrackerService, "searchGamertag").mockResolvedValue(searchResult);
    vi.spyOn(individualTrackerService, "getSearchEsra").mockResolvedValue({ esra: null, lastRankedGamePlayed: null });
    const getMatchHistorySpy = vi
      .spyOn(individualTrackerService, "getMatchHistory")
      .mockResolvedValueOnce({ matches: [aFakeMatchHistoryEntryWith({ matchId: "m-1" })], suggestedGroupings: [] });

    presenter.search("Master Chief");
    await vi.waitFor(() => {
      expect(viewerStore.getSnapshot().status).toBe(ComponentLoaderStatus.LOADED);
    });

    expect(getMatchHistorySpy).toHaveBeenCalledWith("xuid-1", 0, MATCH_PAGE_SIZE);
    const { view } = viewerStore.getSnapshot();
    expect(view?.gamertag).toBe("Master Chief");
    expect(view?.matches).toHaveLength(1);
    expect(view?.matches[0]?.matchId).toBe("m-1");
  });

  it("sets an error when the gamertag cannot be resolved", async () => {
    const { presenter, viewerStore, individualTrackerService } = aPresenterSetup();
    vi.spyOn(individualTrackerService, "searchGamertag").mockResolvedValue(null);

    presenter.search("Unknown Spartan");
    await vi.waitFor(() => {
      expect(viewerStore.getSnapshot().status).toBe(ComponentLoaderStatus.ERROR);
    });

    expect(viewerStore.getSnapshot().errorMessage).toBe("No matching gamertag found.");
  });

  it("reports hasMore true when a full page is returned, and appends subsequent pages on loadMore", async () => {
    const { presenter, viewerStore, individualTrackerService } = aPresenterSetup();
    vi.spyOn(individualTrackerService, "searchGamertag").mockResolvedValue(aFakeTrackerSearchResultWith());
    vi.spyOn(individualTrackerService, "getSearchEsra").mockResolvedValue({ esra: null, lastRankedGamePlayed: null });
    const getMatchHistorySpy = vi
      .spyOn(individualTrackerService, "getMatchHistory")
      .mockResolvedValueOnce({ matches: aFullPageOfEntries("page1"), suggestedGroupings: [] })
      .mockResolvedValueOnce({ matches: aFullPageOfEntries("page2"), suggestedGroupings: [] });

    presenter.search("Fake Spartan");
    await vi.waitFor(() => {
      expect(viewerStore.getSnapshot().status).toBe(ComponentLoaderStatus.LOADED);
    });

    expect(viewerStore.getSnapshot()).toMatchObject({ hasMore: true, loadingMore: false });
    expect(viewerStore.getSnapshot().view?.matches).toHaveLength(MATCH_PAGE_SIZE);

    presenter.loadMore();
    await vi.waitFor(() => {
      expect(viewerStore.getSnapshot().view?.matches).toHaveLength(MATCH_PAGE_SIZE * 2);
    });

    expect(getMatchHistorySpy).toHaveBeenNthCalledWith(2, expect.any(String), MATCH_PAGE_SIZE, MATCH_PAGE_SIZE);
    expect(viewerStore.getSnapshot()).toMatchObject({ hasMore: true, loadingMore: false });
  });

  it("reports hasMore false when a page shorter than the page size is returned", async () => {
    const { presenter, viewerStore, individualTrackerService } = aPresenterSetup();
    vi.spyOn(individualTrackerService, "searchGamertag").mockResolvedValue(aFakeTrackerSearchResultWith());
    vi.spyOn(individualTrackerService, "getSearchEsra").mockResolvedValue({ esra: null, lastRankedGamePlayed: null });
    vi.spyOn(individualTrackerService, "getMatchHistory").mockResolvedValueOnce({
      matches: [aFakeMatchHistoryEntryWith({ matchId: "m-1" })],
      suggestedGroupings: [],
    });

    presenter.search("Fake Spartan");
    await vi.waitFor(() => {
      expect(viewerStore.getSnapshot().status).toBe(ComponentLoaderStatus.LOADED);
    });

    expect(viewerStore.getSnapshot()).toMatchObject({ hasMore: false, loadingMore: false });
  });

  it("sets loadMoreError and clears loadingMore when a subsequent page fails to load", async () => {
    const { presenter, viewerStore, individualTrackerService } = aPresenterSetup();
    vi.spyOn(individualTrackerService, "searchGamertag").mockResolvedValue(aFakeTrackerSearchResultWith());
    vi.spyOn(individualTrackerService, "getSearchEsra").mockResolvedValue({ esra: null, lastRankedGamePlayed: null });
    vi.spyOn(individualTrackerService, "getMatchHistory")
      .mockResolvedValueOnce({ matches: aFullPageOfEntries("page1"), suggestedGroupings: [] })
      .mockRejectedValueOnce(new Error("Network error"));

    presenter.search("Fake Spartan");
    await vi.waitFor(() => {
      expect(viewerStore.getSnapshot().status).toBe(ComponentLoaderStatus.LOADED);
    });

    presenter.loadMore();
    await vi.waitFor(() => {
      expect(viewerStore.getSnapshot().loadMoreError).toBe("Network error");
    });

    expect(viewerStore.getSnapshot()).toMatchObject({ loadingMore: false, loadMoreError: "Network error" });
    expect(viewerStore.getSnapshot().status).toBe(ComponentLoaderStatus.LOADED);
  });

  it("ignores a loadMore call while a previous page is still loading", async () => {
    const { presenter, viewerStore, individualTrackerService } = aPresenterSetup();
    vi.spyOn(individualTrackerService, "searchGamertag").mockResolvedValue(aFakeTrackerSearchResultWith());
    vi.spyOn(individualTrackerService, "getSearchEsra").mockResolvedValue({ esra: null, lastRankedGamePlayed: null });
    let resolveSecondPage: (() => void) | undefined;
    const secondPagePromise = new Promise<{
      matches: ReturnType<typeof aFakeMatchHistoryEntryWith>[];
      suggestedGroupings: never[];
    }>((resolve) => {
      resolveSecondPage = (): void => {
        resolve({ matches: aFullPageOfEntries("page2"), suggestedGroupings: [] });
      };
    });
    const getMatchHistorySpy = vi
      .spyOn(individualTrackerService, "getMatchHistory")
      .mockResolvedValueOnce({ matches: aFullPageOfEntries("page1"), suggestedGroupings: [] })
      .mockReturnValueOnce(secondPagePromise);

    presenter.search("Fake Spartan");
    await vi.waitFor(() => {
      expect(viewerStore.getSnapshot().status).toBe(ComponentLoaderStatus.LOADED);
    });

    presenter.loadMore();
    await vi.waitFor(() => {
      expect(viewerStore.getSnapshot().loadingMore).toBe(true);
    });

    presenter.loadMore();
    resolveSecondPage?.();
    await vi.waitFor(() => {
      expect(viewerStore.getSnapshot().loadingMore).toBe(false);
    });

    expect(getMatchHistorySpy).toHaveBeenCalledTimes(2);
  });

  it("updates the current-rank stats highlight once ESRA resolves after the initial page load", async () => {
    const { presenter, viewerStore, individualTrackerService } = aPresenterSetup({
      visibleSections: { statsHighlightSlots: ["esra"] },
    });
    vi.spyOn(individualTrackerService, "searchGamertag").mockResolvedValue(
      aFakeTrackerSearchResultWith({ gamertag: "Fake Spartan", xuid: "xuid-1" }),
    );
    vi.spyOn(individualTrackerService, "getMatchHistory").mockResolvedValue({ matches: [], suggestedGroupings: [] });
    vi.spyOn(individualTrackerService, "getSearchEsra").mockResolvedValue({
      esra: 1450,
      lastRankedGamePlayed: "2026-01-01T00:00:00.000Z",
    });

    presenter.search("Fake Spartan");
    await vi.waitFor(() => {
      expect(viewerStore.getSnapshot().status).toBe(ComponentLoaderStatus.LOADED);
    });

    await vi.waitFor(() => {
      const highlight = viewerStore.getSnapshot().view?.statsHighlights?.find((item) => item.label === "ESRA");
      expect(highlight?.value).toBe("1,450");
    });
  });
});
