import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { IndividualTrackerService } from "../../../../services/individual-tracker/types";
import type {
  CondensedMatchHistoryService,
  PreparedMatchHistoryEntry,
} from "../../../../services/individual-tracker/condensed-match-history-types";
import {
  aFakeCondensedMatchHistoryEntryWith,
  aFakeCondensedMatchHistoryServiceWith,
} from "../../../../services/individual-tracker/fakes/condensed-match-history.fake";
import { FakeIndividualTrackerService } from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import { prepareCondensedMatchHistory } from "../../../../services/individual-tracker/prepare-condensed-match-history";
import { MatchSelectionDialogStore } from "../match-selection-dialog-store";
import { MatchSelectionDialogPresenter } from "../match-selection-dialog-presenter";

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function aFakeService(
  overrides: {
    getMatchHistory?: CondensedMatchHistoryService["getMatchHistory"];
    syncMatchesToTracker?: IndividualTrackerService["syncMatchesToTracker"];
  } = {},
): {
  historyService: CondensedMatchHistoryService;
  trackerService: IndividualTrackerService;
  getMatchHistory: MockInstance<CondensedMatchHistoryService["getMatchHistory"]>;
  syncMatchesToTracker: MockInstance<IndividualTrackerService["syncMatchesToTracker"]>;
} {
  const historyService = aFakeCondensedMatchHistoryServiceWith({ matches: [] });
  const trackerService: IndividualTrackerService = new FakeIndividualTrackerService();
  const getMatchHistory = vi.spyOn(historyService, "getMatchHistory");
  const syncMatchesToTracker = vi.spyOn(trackerService, "syncMatchesToTracker");
  if (overrides.getMatchHistory != null) {
    getMatchHistory.mockImplementation(overrides.getMatchHistory);
  }
  if (overrides.syncMatchesToTracker != null) {
    syncMatchesToTracker.mockImplementation(overrides.syncMatchesToTracker);
  }
  return {
    historyService,
    trackerService,
    getMatchHistory,
    syncMatchesToTracker,
  };
}

function aMatch(matchId: string): PreparedMatchHistoryEntry {
  return prepareCondensedMatchHistory({
    matches: [
      aFakeCondensedMatchHistoryEntryWith({
        matchId,
        mapAssetId: `map-${matchId}`,
        mapVersionId: `map-version-${matchId}`,
        modeAssetId: `mode-${matchId}`,
        modeVersionId: `mode-version-${matchId}`,
        mapName: "Aquarius",
      }),
    ],
    suggestedGroupings: [],
  }).matches[0];
}

function buildPresenter(
  service: ReturnType<typeof aFakeService>,
  store: MatchSelectionDialogStore,
  overrides: {
    readonly initialSelectedMatchIds?: readonly string[];
    readonly initialGroupings?: readonly (readonly string[])[];
    readonly initialSeriesGroups?: readonly {
      matchIds: readonly string[];
      titleOverride: string | null;
      subtitleOverride: string | null;
    }[];
    readonly searchStartTime?: string;
    readonly onSynced?: () => void;
  } = {},
): MatchSelectionDialogPresenter {
  return new MatchSelectionDialogPresenter({
    store,
    service: service.trackerService,
    historyService: service.historyService,
    trackerId: "tracker-1",
    xuid: "xuid-1",
    initialSelectedMatchIds: overrides.initialSelectedMatchIds ?? [],
    initialGroupings: overrides.initialGroupings ?? [],
    initialSeriesGroups: overrides.initialSeriesGroups ?? [],
    searchStartTime: overrides.searchStartTime,
    onSynced: overrides.onSynced ?? vi.fn(),
  });
}

describe("MatchSelectionDialogPresenter", () => {
  let store: MatchSelectionDialogStore;

  beforeEach(() => {
    store = new MatchSelectionDialogStore();
  });

  describe("loadMatches()", () => {
    it("resets state and loads matches from service", async () => {
      const matches = [aMatch("m1"), aMatch("m2")];
      const service = aFakeService({
        getMatchHistory: vi.fn<CondensedMatchHistoryService["getMatchHistory"]>().mockResolvedValue({
          matches,
          suggestedGroupings: [],
        }),
      });

      const presenter = buildPresenter(service, store);
      presenter.loadMatches();

      expect(store.getSnapshot().matches).toBeNull();

      await flushPromises();
      expect(store.getSnapshot().matches).toEqual(matches);
      expect(service.getMatchHistory).toHaveBeenCalledWith({ xuid: "xuid-1", start: 0, count: 25 });
    });

    it("keeps hasMore true when auto-preload stops on a full page", async () => {
      const page = Array.from({ length: 25 }, (_, index) => aMatch(`m-${index.toString()}`));
      const service = aFakeService({
        getMatchHistory: vi.fn<CondensedMatchHistoryService["getMatchHistory"]>().mockResolvedValue({
          matches: page,
          suggestedGroupings: [],
        }),
      });

      const presenter = buildPresenter(service, store);
      presenter.loadMatches();

      await flushPromises();
      expect(store.getSnapshot().hasMore).toBe(true);
    });

    it("preloads up to four pages, preserves unloaded selections and sends overrides on sync", async () => {
      const matches = Array.from({ length: 110 }, (_, index) =>
        aFakeCondensedMatchHistoryEntryWith({ matchId: `m-${index.toString()}`, teamRosterSignature: null }),
      );
      const service = aFakeService();
      const history = aFakeCondensedMatchHistoryServiceWith({ matches });
      service.getMatchHistory.mockImplementation(history.getMatchHistory.bind(history));
      const seriesGroup = {
        matchIds: ["outside-a", "outside-b"],
        titleOverride: "Title",
        subtitleOverride: "Subtitle",
      };
      const presenter = buildPresenter(service, store, {
        initialSelectedMatchIds: ["outside-a"],
        initialGroupings: [seriesGroup.matchIds],
        initialSeriesGroups: [seriesGroup],
        searchStartTime: "2025-01-01T00:00:00.000Z",
      });

      presenter.loadMatches();
      await flushPromises();
      expect(service.getMatchHistory).toHaveBeenCalledTimes(4);
      expect(store.getSnapshot().matches).toHaveLength(100);
      expect(store.getSnapshot().hasMore).toBe(true);
      presenter.syncAndClose();
      await flushPromises();
      expect(service.syncMatchesToTracker).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedMatchIds: ["outside-a"],
          seriesGroups: [seriesGroup],
        }),
      );
    });

    it("loads through the search boundary even after selected matches are found", async () => {
      const matches = Array.from({ length: 26 }, (_, index) =>
        aFakeCondensedMatchHistoryEntryWith({
          matchId: `m-${index.toString()}`,
          startTimeIso: index === 25 ? "2025-01-01T00:00:00.000Z" : "2026-01-02T01:00:00.000Z",
        }),
      );
      const service = aFakeService();
      const history = aFakeCondensedMatchHistoryServiceWith({ matches });
      service.getMatchHistory.mockImplementation(history.getMatchHistory.bind(history));
      const presenter = buildPresenter(service, store, {
        initialSelectedMatchIds: ["m-0"],
        searchStartTime: "2026-01-01T00:00:00.000Z",
      });
      presenter.loadMatches();
      await flushPromises();
      expect(service.getMatchHistory).toHaveBeenCalledTimes(2);
      expect(store.getSnapshot().matches).toHaveLength(26);
    });

    it("sets suggested groupings when no initial groupings", async () => {
      const service = aFakeService({
        getMatchHistory: vi.fn<CondensedMatchHistoryService["getMatchHistory"]>().mockResolvedValue({
          matches: [aMatch("m1"), aMatch("m2")],
          suggestedGroupings: [["m1", "m2"]],
        }),
      });

      const presenter = buildPresenter(service, store, { initialGroupings: [] });
      presenter.loadMatches();

      await flushPromises();
      expect(store.getSnapshot().groupings).toEqual([["m1", "m2"]]);
    });

    it("extends initial groupings when suggestions overlap", async () => {
      const service = aFakeService({
        getMatchHistory: vi.fn<CondensedMatchHistoryService["getMatchHistory"]>().mockResolvedValue({
          matches: [aMatch("m1"), aMatch("m2"), aMatch("m3")],
          suggestedGroupings: [["m1", "m2", "m3"]],
        }),
      });

      const presenter = buildPresenter(service, store, { initialGroupings: [["m1", "m2"]] });
      presenter.loadMatches();

      await flushPromises();
      expect(store.getSnapshot().matches).not.toBeNull();
      expect(store.getSnapshot().groupings).toEqual([["m1", "m2", "m3"]]);
    });

    it("sets error message on failure", async () => {
      const service = aFakeService({
        getMatchHistory: vi
          .fn<CondensedMatchHistoryService["getMatchHistory"]>()
          .mockRejectedValue(new Error("Network error")),
      });

      const presenter = buildPresenter(service, store);
      presenter.loadMatches();

      await flushPromises();
      expect(store.getSnapshot().errorMessage).toBe("Network error");
    });

    it("does not update store after dispose", async () => {
      const service = aFakeService({
        getMatchHistory: vi.fn<CondensedMatchHistoryService["getMatchHistory"]>().mockResolvedValue({
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

  describe("loadMore()", () => {
    it("recomputes and merges suggestions using new page plus prior-page boundary", async () => {
      const firstPageTail = [aMatch("old-1"), aMatch("old-2")];
      const service = aFakeService({
        getMatchHistory: vi.fn<CondensedMatchHistoryService["getMatchHistory"]>().mockResolvedValue({
          matches: [aMatch("new-1"), aMatch("new-2")],
          suggestedGroupings: [],
        }),
      });

      store.batchUpdate({
        matches: firstPageTail,
        groupings: [],
        seriesGroups: [],
      });

      const presenter = buildPresenter(service, store);
      await presenter.loadMore();

      expect(store.getSnapshot().groupings).toEqual([["old-1", "old-2", "new-1", "new-2"]]);
    });

    it("extends an existing grouping when load-more suggestions overlap", async () => {
      const existingGroupMatches = [aMatch("old-1"), aMatch("old-2")];
      const service = aFakeService({
        getMatchHistory: vi.fn<CondensedMatchHistoryService["getMatchHistory"]>().mockResolvedValue({
          matches: [aMatch("new-1")],
          suggestedGroupings: [],
        }),
      });

      store.batchUpdate({
        matches: existingGroupMatches,
        groupings: [["old-1", "old-2"]],
        seriesGroups: [],
      });

      const presenter = buildPresenter(service, store);
      await presenter.loadMore();

      expect(store.getSnapshot().groupings).toEqual([["old-1", "old-2", "new-1"]]);
    });

    it("does not create new groups from older non-boundary data", async () => {
      const oldMatches = [aMatch("old-a"), aMatch("old-b")];
      const fillerMatches = Array.from({ length: 24 }, (_, index) => ({
        ...aMatch(`filler-${index.toString()}`),
        isMatchmaking: true,
        category: "matchmaking" as const,
      }));
      const boundaryMatch = aMatch("old-tail");
      const service = aFakeService({
        getMatchHistory: vi.fn<CondensedMatchHistoryService["getMatchHistory"]>().mockResolvedValue({
          matches: [aMatch("new-1")],
          suggestedGroupings: [],
        }),
      });

      store.batchUpdate({
        matches: [...oldMatches, ...fillerMatches, boundaryMatch],
        groupings: [],
        seriesGroups: [],
      });

      const presenter = buildPresenter(service, store);
      await presenter.loadMore();

      expect(store.getSnapshot().groupings).toEqual([["old-tail", "new-1"]]);
      expect(store.getSnapshot().groupings).not.toContainEqual(["old-a", "old-b"]);
    });

    it("groups matches with same team rosters regardless of team order", async () => {
      const teamAlpha = ["alpha", "bravo"];
      const teamBeta = ["charlie", "delta"];

      const match1 = {
        ...aMatch("m1"),
        teams: [teamAlpha, teamBeta],
      };
      const match2 = {
        ...aMatch("m2"),
        teams: [teamBeta, teamAlpha],
      };

      const service = aFakeService({
        getMatchHistory: vi.fn<CondensedMatchHistoryService["getMatchHistory"]>().mockResolvedValue({
          matches: [match2],
          suggestedGroupings: [],
        }),
      });

      store.batchUpdate({
        matches: [match1],
        groupings: [],
        seriesGroups: [],
      });

      const presenter = buildPresenter(service, store);
      await presenter.loadMore();

      expect(store.getSnapshot().groupings).toEqual([["m1", "m2"]]);
    });

    it("uses canonical signatures across page boundaries rather than duplicate or unknown display names", async () => {
      const first = { ...aMatch("first"), teams: [["Unknown"], ["Unknown"]], teamRosterSignature: "x1,x2|x3,x4" };
      const same = {
        ...aMatch("same"),
        teams: [["renamed"], ["Unknown"]],
        teamRosterSignature: first.teamRosterSignature,
      };
      const different = { ...aMatch("different"), teams: first.teams, teamRosterSignature: "x1,x3|x2,x4" };
      const missing = { ...aMatch("missing"), teams: first.teams, teamRosterSignature: null };
      const service = aFakeService({
        getMatchHistory: vi.fn<CondensedMatchHistoryService["getMatchHistory"]>().mockResolvedValue({
          matches: [same, different, missing],
          suggestedGroupings: [],
        }),
      });
      store.batchUpdate({ matches: [first], groupings: [["first", "outside"]], seriesGroups: [] });
      await buildPresenter(service, store).loadMore();
      expect(store.getSnapshot().groupings).toEqual([["first", "same", "outside"]]);
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
            ...aMatch("short"),
            startTimeIso: "2026-01-01T00:00:00.000Z",
            endTimeIso: "2026-01-01T00:01:00.000Z",
          },
          {
            ...aMatch("long"),
            startTimeIso: "2026-01-01T00:02:00.000Z",
            endTimeIso: "2026-01-01T00:12:00.000Z",
          },
        ],
      });

      const model = MatchSelectionDialogPresenter.present(store.getSnapshot());

      expect(model.visibleMatches?.map((m) => m.matchId)).toEqual(["long"]);
    });

    it("shows all matches when hideShortGames is false", () => {
      store.batchUpdate({
        hideShortGames: false,
        matches: [
          {
            ...aMatch("short"),
            startTimeIso: "2026-01-01T00:00:00.000Z",
            endTimeIso: "2026-01-01T00:01:00.000Z",
          },
        ],
      });

      const model = MatchSelectionDialogPresenter.present(store.getSnapshot());

      expect(model.visibleMatches?.map((m) => m.matchId)).toEqual(["short"]);
    });
  });
});
