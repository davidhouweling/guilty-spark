import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  IndividualTrackerService,
  TrackerMatchHistoryResponse,
} from "../../../../services/individual-tracker/types";
import { GameSelectionDialogStore } from "../game-selection-dialog-store";
import { GameSelectionDialogPresenter } from "../game-selection-dialog-presenter";

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function aFakeService(
  overrides: Partial<Pick<IndividualTrackerService, "getMatchHistory" | "syncMatchesToTracker">> = {},
): Pick<IndividualTrackerService, "getMatchHistory" | "syncMatchesToTracker"> {
  return {
    getMatchHistory: vi.fn<IndividualTrackerService["getMatchHistory"]>().mockResolvedValue({
      matches: [],
      suggestedGroupings: [],
    }),
    syncMatchesToTracker: vi.fn<IndividualTrackerService["syncMatchesToTracker"]>().mockResolvedValue(undefined),
    ...overrides,
  };
}

function aMatch(matchId: string): TrackerMatchHistoryResponse["matches"][number] {
  return {
    matchId,
    startTime: "Jan 1, 2026, 12:00:00 AM",
    endTime: "Jan 1, 2026, 12:10:00 AM",
    mapAssetId: `map-${matchId}`,
    mapVersionId: `map-version-${matchId}`,
    modeAssetId: `mode-${matchId}`,
    modeVersionId: `mode-version-${matchId}`,
    gameVariantCategory: 6,
    duration: "10m 0s",
    mapName: "Aquarius",
    modeName: "Slayer",
    outcome: "Win",
    resultString: "Win - 50:40",
    isMatchmaking: false,
    category: "custom",
    teams: [],
    mapThumbnailUrl: "data:,",
  };
}

function buildPresenter(
  service: ReturnType<typeof aFakeService>,
  store: GameSelectionDialogStore,
  overrides: {
    readonly initialSelectedMatchIds?: readonly string[];
    readonly initialGroupings?: readonly (readonly string[])[];
    readonly onSynced?: () => void;
  } = {},
): GameSelectionDialogPresenter {
  return new GameSelectionDialogPresenter({
    store,
    service: service as unknown as IndividualTrackerService,
    trackerId: "tracker-1",
    xuid: "xuid-1",
    initialSelectedMatchIds: overrides.initialSelectedMatchIds ?? [],
    initialGroupings: overrides.initialGroupings ?? [],
    initialSeriesGroups: [],
    onSynced: overrides.onSynced ?? vi.fn(),
  });
}

describe("GameSelectionDialogPresenter", () => {
  let store: GameSelectionDialogStore;

  beforeEach(() => {
    store = new GameSelectionDialogStore();
  });

  describe("loadMatches()", () => {
    it("resets state and loads matches from service", async () => {
      const matches = [aMatch("m1"), aMatch("m2")];
      const service = aFakeService({
        getMatchHistory: vi.fn<IndividualTrackerService["getMatchHistory"]>().mockResolvedValue({
          matches,
          suggestedGroupings: [],
        }),
      });

      const presenter = buildPresenter(service, store);
      presenter.loadMatches();

      expect(store.getSnapshot().matches).toBeNull();

      await flushPromises();
      expect(store.getSnapshot().matches).toEqual(matches);
      expect(service.getMatchHistory).toHaveBeenCalledWith("xuid-1", 0, 25);
    });

    it("sets suggested groupings when no initial groupings", async () => {
      const service = aFakeService({
        getMatchHistory: vi.fn<IndividualTrackerService["getMatchHistory"]>().mockResolvedValue({
          matches: [aMatch("m1"), aMatch("m2")],
          suggestedGroupings: [["m1", "m2"]],
        }),
      });

      const presenter = buildPresenter(service, store, { initialGroupings: [] });
      presenter.loadMatches();

      await flushPromises();
      expect(store.getSnapshot().groupings).toEqual([["m1", "m2"]]);
    });

    it("preserves initial groupings over suggested groupings", async () => {
      const service = aFakeService({
        getMatchHistory: vi.fn<IndividualTrackerService["getMatchHistory"]>().mockResolvedValue({
          matches: [aMatch("m1"), aMatch("m2"), aMatch("m3")],
          suggestedGroupings: [["m1", "m2", "m3"]],
        }),
      });

      const presenter = buildPresenter(service, store, { initialGroupings: [["m1", "m2"]] });
      presenter.loadMatches();

      await flushPromises();
      expect(store.getSnapshot().matches).not.toBeNull();
      expect(store.getSnapshot().groupings).toEqual([["m1", "m2"]]);
    });

    it("sets error message on failure", async () => {
      const service = aFakeService({
        getMatchHistory: vi
          .fn<IndividualTrackerService["getMatchHistory"]>()
          .mockRejectedValue(new Error("Network error")),
      });

      const presenter = buildPresenter(service, store);
      presenter.loadMatches();

      await flushPromises();
      expect(store.getSnapshot().errorMessage).toBe("Network error");
    });

    it("does not update store after dispose", async () => {
      const service = aFakeService({
        getMatchHistory: vi.fn<IndividualTrackerService["getMatchHistory"]>().mockResolvedValue({
          matches: [aMatch("m1")],
          suggestedGroupings: [],
        }),
      });

      const presenter = buildPresenter(service, store);
      presenter.loadMatches();
      presenter.dispose();
      await flushPromises();

      expect(store.getSnapshot().matches).toBeNull();
    });
  });

  describe("toggleMatch()", () => {
    it("adds a match to the selection", () => {
      const service = aFakeService();
      const presenter = buildPresenter(service, store);

      presenter.toggleMatch("m1");

      expect(store.getSnapshot().selectedMatchIds.has("m1")).toBe(true);
    });

    it("removes a match already in the selection", () => {
      const service = aFakeService();
      const presenter = buildPresenter(service, store, { initialSelectedMatchIds: ["m1"] });
      presenter.loadMatches();

      presenter.toggleMatch("m1");

      expect(store.getSnapshot().selectedMatchIds.has("m1")).toBe(false);
    });
  });

  describe("setHideShortGames()", () => {
    it("updates hideShortGames in the store", () => {
      const service = aFakeService();
      const presenter = buildPresenter(service, store);

      presenter.setHideShortGames(false);

      expect(store.getSnapshot().hideShortGames).toBe(false);
    });
  });

  describe("syncAndClose()", () => {
    it("calls syncMatchesToTracker with selected match ids and invokes onSynced", async () => {
      const service = aFakeService();
      const onSynced = vi.fn();
      const presenter = buildPresenter(service, store, {
        initialSelectedMatchIds: ["m1"],
        onSynced,
      });
      presenter.loadMatches();
      presenter.syncAndClose();

      await flushPromises();
      expect(service.syncMatchesToTracker).toHaveBeenCalledWith(
        expect.objectContaining({
          trackerId: "tracker-1",
          selectedMatchIds: ["m1"],
        }),
      );
      expect(onSynced).toHaveBeenCalledOnce();
    });

    it("sets error message when sync fails", async () => {
      const service = aFakeService({
        syncMatchesToTracker: vi
          .fn<IndividualTrackerService["syncMatchesToTracker"]>()
          .mockRejectedValue(new Error("Sync failed")),
      });
      const presenter = buildPresenter(service, store);
      presenter.syncAndClose();

      await flushPromises();
      expect(store.getSnapshot().errorMessage).toBe("Sync failed");
      expect(store.getSnapshot().isSyncing).toBe(false);
    });

    it("does not call sync a second time while already syncing", () => {
      const service = aFakeService();
      const presenter = buildPresenter(service, store);

      store.setSyncing(true);
      presenter.syncAndClose();

      expect(service.syncMatchesToTracker).not.toHaveBeenCalled();
    });
  });

  describe("present()", () => {
    it("filters short matches when hideShortGames is true", () => {
      store.batchUpdate({
        hideShortGames: true,
        matches: [
          {
            matchId: "short",
            startTimeIso: "2026-01-01T00:00:00.000Z",
            endTimeIso: "2026-01-01T00:01:00.000Z",
            startTime: "Jan 1, 2026, 12:00:00 AM",
            endTime: "Jan 1, 2026, 12:01:00 AM",
            mapAssetId: "map",
            mapVersionId: "ver",
            modeAssetId: "mode",
            modeVersionId: "ver",
            gameVariantCategory: 6,
            duration: "1m 0s",
            mapName: "Aquarius",
            modeName: "Slayer",
            outcome: "Win",
            resultString: "Win",
            isMatchmaking: false,
            category: "custom",
            teams: [],
            mapThumbnailUrl: "data:,",
          },
          {
            matchId: "long",
            startTimeIso: "2026-01-01T00:02:00.000Z",
            endTimeIso: "2026-01-01T00:12:00.000Z",
            startTime: "Jan 1, 2026, 12:02:00 AM",
            endTime: "Jan 1, 2026, 12:12:00 AM",
            mapAssetId: "map",
            mapVersionId: "ver",
            modeAssetId: "mode",
            modeVersionId: "ver",
            gameVariantCategory: 6,
            duration: "10m 0s",
            mapName: "Bazaar",
            modeName: "Slayer",
            outcome: "Win",
            resultString: "Win",
            isMatchmaking: false,
            category: "custom",
            teams: [],
            mapThumbnailUrl: "data:,",
          },
        ],
      });

      const model = GameSelectionDialogPresenter.present(store.getSnapshot());

      expect(model.visibleMatches?.map((m) => m.matchId)).toEqual(["long"]);
    });

    it("shows all matches when hideShortGames is false", () => {
      store.batchUpdate({
        hideShortGames: false,
        matches: [
          {
            matchId: "short",
            startTimeIso: "2026-01-01T00:00:00.000Z",
            endTimeIso: "2026-01-01T00:01:00.000Z",
            startTime: "Jan 1, 2026, 12:00:00 AM",
            endTime: "Jan 1, 2026, 12:01:00 AM",
            mapAssetId: "map",
            mapVersionId: "ver",
            modeAssetId: "mode",
            modeVersionId: "ver",
            gameVariantCategory: 6,
            duration: "1m 0s",
            mapName: "Aquarius",
            modeName: "Slayer",
            outcome: "Win",
            resultString: "Win",
            isMatchmaking: false,
            category: "custom",
            teams: [],
            mapThumbnailUrl: "data:,",
          },
        ],
      });

      const model = GameSelectionDialogPresenter.present(store.getSnapshot());

      expect(model.visibleMatches?.map((m) => m.matchId)).toEqual(["short"]);
    });
  });
});
