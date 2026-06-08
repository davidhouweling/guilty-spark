import { afterEach, describe, expect, it, vi } from "vitest";
import type { IndividualTrackerService } from "../../../../services/individual-tracker/types";
import { aFakeIndividualTrackerServiceWith } from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import { AddTrackerDialogStore } from "../add-tracker-dialog-store";
import { AddTrackerDialogPresenter } from "../add-tracker-dialog-presenter";

function buildPresenter(opts: { service?: IndividualTrackerService; onTrackerStarted?: () => void }): {
  store: AddTrackerDialogStore;
  presenter: AddTrackerDialogPresenter;
} {
  const store = new AddTrackerDialogStore();
  const presenter = new AddTrackerDialogPresenter({
    store,
    individualTrackerService: opts.service ?? aFakeIndividualTrackerServiceWith(),
    onTrackerStarted: opts.onTrackerStarted ?? vi.fn<() => void>(),
  });
  return { store, presenter };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AddTrackerDialogPresenter", () => {
  describe("setQuery", () => {
    it("updates query in the store", () => {
      const { store, presenter } = buildPresenter({});

      presenter.setQuery("Chief");

      expect(store.getSnapshot().query).toBe("Chief");
    });

    it("does nothing when disposed", () => {
      const { store, presenter } = buildPresenter({});

      presenter.dispose();
      presenter.setQuery("Chief");

      expect(store.getSnapshot().query).toBe("");
    });
  });

  describe("search", () => {
    it("sets searching flag while searching", async () => {
      let resolveSearch!: (v: null) => void;
      const service = aFakeIndividualTrackerServiceWith({
        searchResult: null,
      });
      vi.spyOn(service, "searchGamertag").mockImplementation(
        async () =>
          new Promise<null>((resolve) => {
            resolveSearch = resolve;
          }),
      );

      const { store, presenter } = buildPresenter({ service });
      presenter.setQuery("Chief");
      presenter.search();

      expect(store.getSnapshot().searching).toBe(true);
      resolveSearch(null);
      await Promise.resolve();
    });

    it("sets searchError when no gamertag found", async () => {
      const service = aFakeIndividualTrackerServiceWith({ searchResult: null });
      const { store, presenter } = buildPresenter({ service });

      presenter.setQuery("NoSuchPlayer");
      presenter.search();

      await vi.waitFor(() => {
        expect(store.getSnapshot().searching).toBe(false);
      });

      expect(store.getSnapshot().searchError).toBe("No matching gamertag found.");
      expect(store.getSnapshot().result).toBeNull();
    });

    it("sets result and loads matches on success", async () => {
      const matchHistory = {
        matches: [
          {
            matchId: "m1",
            startTime: "Jan 1, 2026, 12:00:00 AM",
            endTime: "Jan 1, 2026, 12:10:00 AM",
            mapAssetId: "map-1",
            mapVersionId: "map-v-1",
            modeAssetId: "mode-1",
            modeVersionId: "mode-v-1",
            gameVariantCategory: 6 as const,
            duration: "10m 0s",
            mapName: "Aquarius",
            modeName: "Slayer",
            outcome: "Win" as const,
            resultString: "Win - 50:40",
            isMatchmaking: false,
            category: "custom" as const,
            teams: [],
            mapThumbnailUrl: "data:,",
          },
        ],
        suggestedGroupings: [],
      };
      const service = aFakeIndividualTrackerServiceWith({ matchHistory });
      const { store, presenter } = buildPresenter({ service });

      presenter.setQuery("Chief");
      presenter.search();

      await vi.waitFor(() => {
        expect(store.getSnapshot().result).not.toBeNull();
      });

      expect(store.getSnapshot().result?.gamertag).toBe("Fake Spartan");
      expect(store.getSnapshot().matches).toHaveLength(1);
      expect(store.getSnapshot().searching).toBe(false);
      expect(store.getSnapshot().loadingMatches).toBe(false);
    });

    it("sets searchError when service throws", async () => {
      const service = aFakeIndividualTrackerServiceWith();
      vi.spyOn(service, "searchGamertag").mockRejectedValue(new Error("Network error"));

      const { store, presenter } = buildPresenter({ service });
      presenter.setQuery("Chief");
      presenter.search();

      await vi.waitFor(() => {
        expect(store.getSnapshot().searching).toBe(false);
      });

      expect(store.getSnapshot().searchError).toBe("Network error");
    });

    it("ignores stale responses after dispose", async () => {
      let resolveSearch!: (v: null) => void;
      const service = aFakeIndividualTrackerServiceWith({ searchResult: null });
      vi.spyOn(service, "searchGamertag").mockImplementation(
        async () =>
          new Promise<null>((resolve) => {
            resolveSearch = resolve;
          }),
      );

      const { store, presenter } = buildPresenter({ service });
      presenter.setQuery("Chief");
      presenter.search();
      presenter.dispose();
      resolveSearch(null);

      await Promise.resolve();

      expect(store.getSnapshot().searching).toBe(true);
    });
  });

  describe("toggleMatch", () => {
    it("adds a match to selectedMatchIds when not present", () => {
      const { store, presenter } = buildPresenter({});

      presenter.toggleMatch("m1");

      expect(store.getSnapshot().selectedMatchIds).toContain("m1");
    });

    it("removes a match from selectedMatchIds when already present", () => {
      const { store, presenter } = buildPresenter({});
      presenter.toggleMatch("m1");

      presenter.toggleMatch("m1");

      expect(store.getSnapshot().selectedMatchIds).not.toContain("m1");
    });
  });

  describe("breakGroup", () => {
    it("removes a single-element group from groupings", () => {
      const matchHistory = {
        matches: [
          {
            matchId: "m1",
            startTime: "Jan 1, 2026, 12:00:00 AM",
            endTime: "Jan 1, 2026, 12:10:00 AM",
            mapAssetId: "a",
            mapVersionId: "b",
            modeAssetId: "c",
            modeVersionId: "d",
            gameVariantCategory: 6 as const,
            duration: "10m",
            mapName: "A",
            modeName: "Slayer",
            outcome: "Win" as const,
            resultString: "W",
            isMatchmaking: false,
            category: "custom" as const,
            teams: [],
            mapThumbnailUrl: "data:,",
          },
          {
            matchId: "m2",
            startTime: "Jan 1, 2026, 12:15:00 AM",
            endTime: "Jan 1, 2026, 12:25:00 AM",
            mapAssetId: "a",
            mapVersionId: "b",
            modeAssetId: "c",
            modeVersionId: "d",
            gameVariantCategory: 6 as const,
            duration: "10m",
            mapName: "B",
            modeName: "Slayer",
            outcome: "Win" as const,
            resultString: "W",
            isMatchmaking: false,
            category: "custom" as const,
            teams: [],
            mapThumbnailUrl: "data:,",
          },
        ],
        suggestedGroupings: [["m1", "m2"]],
      };
      const service = aFakeIndividualTrackerServiceWith({ matchHistory });
      const { store, presenter } = buildPresenter({ service });

      store.batchUpdate({
        matches: matchHistory.matches,
        activeGroupings: matchHistory.suggestedGroupings,
        result: {
          gamertag: "Chief",
          xuid: "xuid-1",
          rankLabel: null,
          csrLabel: null,
          currentRankTier: null,
          currentRankSubTier: null,
          currentRankMeasurementMatchesRemaining: null,
          currentRankInitialMeasurementMatches: null,
          allTimePeakRankLabel: null,
          allTimePeakCsrLabel: null,
          allTimePeakRankTier: null,
          allTimePeakRankSubTier: null,
          seasonPeakCsrLabel: null,
          seasonPeakRankTier: null,
          seasonPeakRankSubTier: null,
          matchmadeMatchCount: null,
          customMatchCount: null,
        },
      });

      presenter.breakGroup("m1");

      expect(store.getSnapshot().activeGroupings).toHaveLength(0);
    });
  });

  describe("setHideShortGames", () => {
    it("updates hideShortGames in the store", () => {
      const { store, presenter } = buildPresenter({});

      presenter.setHideShortGames(false);

      expect(store.getSnapshot().hideShortGames).toBe(false);
    });
  });

  describe("startTracker", () => {
    it("calls onTrackerStarted after a successful start", async () => {
      const onTrackerStarted = vi.fn<() => void>();
      const service = aFakeIndividualTrackerServiceWith();
      const { store, presenter } = buildPresenter({ service, onTrackerStarted });

      store.batchUpdate({
        result: {
          gamertag: "Chief",
          xuid: "xuid-1",
          rankLabel: null,
          csrLabel: null,
          currentRankTier: null,
          currentRankSubTier: null,
          currentRankMeasurementMatchesRemaining: null,
          currentRankInitialMeasurementMatches: null,
          allTimePeakRankLabel: null,
          allTimePeakCsrLabel: null,
          allTimePeakRankTier: null,
          allTimePeakRankSubTier: null,
          seasonPeakCsrLabel: null,
          seasonPeakRankTier: null,
          seasonPeakRankSubTier: null,
          matchmadeMatchCount: null,
          customMatchCount: null,
        },
      });

      presenter.startTracker();

      await vi.waitFor(() => {
        expect(onTrackerStarted).toHaveBeenCalledOnce();
      });

      expect(store.getSnapshot().busy).toBe(false);
    });

    it("sets searchError when startTracker throws", async () => {
      const service = aFakeIndividualTrackerServiceWith();
      vi.spyOn(service, "startTracker").mockRejectedValue(new Error("Start failed"));

      const { store, presenter } = buildPresenter({ service });

      store.batchUpdate({
        result: {
          gamertag: "Chief",
          xuid: "xuid-1",
          rankLabel: null,
          csrLabel: null,
          currentRankTier: null,
          currentRankSubTier: null,
          currentRankMeasurementMatchesRemaining: null,
          currentRankInitialMeasurementMatches: null,
          allTimePeakRankLabel: null,
          allTimePeakCsrLabel: null,
          allTimePeakRankTier: null,
          allTimePeakRankSubTier: null,
          seasonPeakCsrLabel: null,
          seasonPeakRankTier: null,
          seasonPeakRankSubTier: null,
          matchmadeMatchCount: null,
          customMatchCount: null,
        },
      });

      presenter.startTracker();

      await vi.waitFor(() => {
        expect(store.getSnapshot().busy).toBe(false);
      });

      expect(store.getSnapshot().searchError).toBe("Start failed");
    });

    it("does nothing when result is null", () => {
      const service = aFakeIndividualTrackerServiceWith();
      const startTrackerSpy = vi.spyOn(service, "startTracker");
      const { presenter } = buildPresenter({ service });

      presenter.startTracker();

      expect(startTrackerSpy).not.toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("clears all state to defaults", () => {
      const { store, presenter } = buildPresenter({});

      store.batchUpdate({
        query: "Chief",
        searchError: "some error",
        result: {
          gamertag: "Chief",
          xuid: "xuid-1",
          rankLabel: null,
          csrLabel: null,
          currentRankTier: null,
          currentRankSubTier: null,
          currentRankMeasurementMatchesRemaining: null,
          currentRankInitialMeasurementMatches: null,
          allTimePeakRankLabel: null,
          allTimePeakCsrLabel: null,
          allTimePeakRankTier: null,
          allTimePeakRankSubTier: null,
          seasonPeakCsrLabel: null,
          seasonPeakRankTier: null,
          seasonPeakRankSubTier: null,
          matchmadeMatchCount: null,
          customMatchCount: null,
        },
      });

      presenter.reset();

      const snapshot = store.getSnapshot();
      expect(snapshot.query).toBe("");
      expect(snapshot.result).toBeNull();
      expect(snapshot.searchError).toBeNull();
      expect(snapshot.matches).toHaveLength(0);
    });
  });

  describe("present", () => {
    it("returns null visibleMatches when loading with no matches", () => {
      const snapshot = {
        query: "",
        searching: false,
        searchError: null,
        result: null,
        matches: [],
        activeGroupings: [],
        loadingMatches: true,
        hasMore: false,
        selectedMatchIds: [],
        seriesGroups: [],
        hideShortGames: true,
        busy: false,
      };

      const model = AddTrackerDialogPresenter.present(snapshot);

      expect(model.visibleMatches).toBeNull();
    });

    it("filters short matches when hideShortGames is true", () => {
      const snapshot = {
        query: "",
        searching: false,
        searchError: null,
        result: null,
        matches: [
          {
            matchId: "short",
            startTime: "Jan 1, 2026, 12:00:00 AM",
            endTime: "Jan 1, 2026, 12:01:00 AM",
            startTimeIso: "2026-01-01T00:00:00.000Z",
            endTimeIso: "2026-01-01T00:01:00.000Z",
            mapAssetId: "a",
            mapVersionId: "b",
            modeAssetId: "c",
            modeVersionId: "d",
            gameVariantCategory: 6 as const,
            duration: "1m",
            mapName: "A",
            modeName: "Slayer",
            outcome: "Win" as const,
            resultString: "W",
            isMatchmaking: false,
            category: "custom" as const,
            teams: [],
            mapThumbnailUrl: "data:,",
          },
          {
            matchId: "long",
            startTime: "Jan 1, 2026, 12:15:00 AM",
            endTime: "Jan 1, 2026, 12:25:00 AM",
            startTimeIso: "2026-01-01T00:15:00.000Z",
            endTimeIso: "2026-01-01T00:25:00.000Z",
            mapAssetId: "a",
            mapVersionId: "b",
            modeAssetId: "c",
            modeVersionId: "d",
            gameVariantCategory: 6 as const,
            duration: "10m",
            mapName: "B",
            modeName: "Slayer",
            outcome: "Win" as const,
            resultString: "W",
            isMatchmaking: false,
            category: "custom" as const,
            teams: [],
            mapThumbnailUrl: "data:,",
          },
        ],
        activeGroupings: [],
        loadingMatches: false,
        hasMore: false,
        selectedMatchIds: [],
        seriesGroups: [],
        hideShortGames: true,
        busy: false,
      };

      const model = AddTrackerDialogPresenter.present(snapshot);

      expect(model.visibleMatches).toHaveLength(1);
      expect(model.visibleMatches?.[0].matchId).toBe("long");
    });
  });
});
