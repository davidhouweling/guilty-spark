import { describe, expect, it, vi } from "vitest";
import type { IndividualTrackerService } from "../../../../services/individual-tracker/types";
import {
  aFakeIndividualTrackerServiceWith,
  aFakeMatchHistoryEntryWith,
  aFakeTrackerSearchResultWith,
} from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import { ManualSeriesDialogPresenter } from "../manual-series-dialog-presenter";
import { ManualSeriesDialogStore } from "../manual-series-dialog-store";

function buildPresenter(
  service: IndividualTrackerService,
  onSeriesStarted = vi.fn<() => void>(),
): { presenter: ManualSeriesDialogPresenter; store: ManualSeriesDialogStore } {
  const store = new ManualSeriesDialogStore();
  const presenter = new ManualSeriesDialogPresenter({
    trackerId: "tracker-1",
    store,
    individualTrackerService: service,
    onSeriesStarted,
  });
  return { presenter, store };
}

describe("ManualSeriesDialogPresenter", () => {
  describe("team editing", () => {
    it("updates team name for the given index", () => {
      const { presenter, store } = buildPresenter(aFakeIndividualTrackerServiceWith());
      presenter.setTeamName(0, "Eagle Squadron");
      expect(store.getSnapshot().teams[0].name).toBe("Eagle Squadron");
    });

    it("updates a specific team member", () => {
      const { presenter, store } = buildPresenter(aFakeIndividualTrackerServiceWith());
      presenter.setTeamMember(1, 2, "SpartanX");
      expect(store.getSnapshot().teams[1].members[2]).toBe("SpartanX");
    });

    it("adds a new empty member to a team", () => {
      const { presenter, store } = buildPresenter(aFakeIndividualTrackerServiceWith());
      const initial = store.getSnapshot().teams[0].members.length;
      presenter.addTeamMember(0);
      expect(store.getSnapshot().teams[0].members.length).toBe(initial + 1);
    });

    it("removes a team member leaving only non-empty and filled slots", () => {
      const { presenter, store } = buildPresenter(aFakeIndividualTrackerServiceWith());
      presenter.setTeamMember(0, 0, "Alpha");
      const initial = store.getSnapshot().teams[0].members.length;
      presenter.removeTeamMember(0, 1);
      expect(store.getSnapshot().teams[0].members.length).toBe(initial - 1);
      expect(store.getSnapshot().teams[0].members[0]).toBe("Alpha");
    });

    it("preserves a single empty slot when all members are removed", () => {
      const { presenter, store } = buildPresenter(aFakeIndividualTrackerServiceWith());
      const initial = store.getSnapshot().teams[0].members.length;
      for (let i = initial - 1; i >= 1; i--) {
        presenter.removeTeamMember(0, i);
      }
      expect(store.getSnapshot().teams[0].members.length).toBe(1);
    });
  });

  describe("backfill discovery", () => {
    it("resolves shared custom matches across all team members", async () => {
      const sharedMatch = aFakeMatchHistoryEntryWith({ matchId: "shared-1", category: "custom" });
      const alphaOnlyMatch = aFakeMatchHistoryEntryWith({ matchId: "alpha-only", category: "custom" });
      const bravoOnlyMatch = aFakeMatchHistoryEntryWith({ matchId: "bravo-only", category: "custom" });

      const alphaResult = aFakeTrackerSearchResultWith({ gamertag: "Alpha", xuid: "xuid-alpha" });
      const bravoResult = aFakeTrackerSearchResultWith({ gamertag: "Bravo", xuid: "xuid-bravo" });

      const service = aFakeIndividualTrackerServiceWith({
        searchResults: [alphaResult, bravoResult],
      });

      const searchSpy = vi.spyOn(service, "searchGamertag");
      const historySpy = vi.spyOn(service, "getMatchHistory").mockImplementation(async (xuid) => {
        await Promise.resolve();
        if (xuid === "xuid-alpha") {
          return { matches: [sharedMatch, alphaOnlyMatch], suggestedGroupings: [] };
        }
        if (xuid === "xuid-bravo") {
          return { matches: [sharedMatch, bravoOnlyMatch], suggestedGroupings: [] };
        }
        return { matches: [], suggestedGroupings: [] };
      });

      const { presenter, store } = buildPresenter(service);
      presenter.setTeamMember(0, 0, "Alpha");
      presenter.setTeamMember(1, 0, "Bravo");

      await new Promise<void>((resolve) => {
        store.subscribe(() => {
          const s = store.getSnapshot();
          if (s.backfillState === "done" || s.backfillState === "error") {
            resolve();
          }
        });
        presenter.discoverBackfillMatches();
      });

      expect(searchSpy).toHaveBeenCalledWith("Alpha");
      expect(searchSpy).toHaveBeenCalledWith("Bravo");
      expect(historySpy).toHaveBeenCalledWith("xuid-alpha", 0, 25, "custom");
      expect(historySpy).toHaveBeenCalledWith("xuid-bravo", 0, 25, "custom");

      const snapshot = store.getSnapshot();
      expect(snapshot.backfillState).toBe("done");
      expect(snapshot.backfillMatches).toHaveLength(1);
      expect(snapshot.backfillMatches[0].matchId).toBe("shared-1");
    });

    it("sets error when no player identities are resolved", async () => {
      const service = aFakeIndividualTrackerServiceWith({ searchResults: [] });
      const { presenter, store } = buildPresenter(service);
      presenter.setTeamMember(0, 0, "Unknown");

      await new Promise<void>((resolve) => {
        store.subscribe(() => {
          const s = store.getSnapshot();
          if (s.backfillState === "done" || s.backfillState === "error") {
            resolve();
          }
        });
        presenter.discoverBackfillMatches();
      });

      const snapshot = store.getSnapshot();
      expect(snapshot.backfillState).toBe("done");
      expect(snapshot.backfillError).toBeTruthy();
    });

    it("sets error when no member names are entered", async () => {
      const service = aFakeIndividualTrackerServiceWith();
      const { presenter, store } = buildPresenter(service);

      await new Promise<void>((resolve) => {
        store.subscribe(() => {
          const s = store.getSnapshot();
          if (s.backfillState !== "idle" && s.backfillState !== "loading") {
            resolve();
          }
        });
        presenter.discoverBackfillMatches();
      });

      expect(store.getSnapshot().backfillError).toBeTruthy();
    });

    it("filters out matchmaking matches from backfill candidates", async () => {
      const customMatch = aFakeMatchHistoryEntryWith({ matchId: "custom-1", category: "custom" });
      const matchmakingMatch = aFakeMatchHistoryEntryWith({
        matchId: "mm-1",
        category: "matchmaking",
        isMatchmaking: true,
      });

      const result = aFakeTrackerSearchResultWith({ gamertag: "Alpha", xuid: "xuid-alpha" });
      const service = aFakeIndividualTrackerServiceWith({ searchResults: [result] });

      vi.spyOn(service, "getMatchHistory").mockResolvedValue({
        matches: [customMatch, matchmakingMatch],
        suggestedGroupings: [],
      });

      const { presenter, store } = buildPresenter(service);
      presenter.setTeamMember(0, 0, "Alpha");

      await new Promise<void>((resolve) => {
        store.subscribe(() => {
          const s = store.getSnapshot();
          if (s.backfillState === "done" || s.backfillState === "error") {
            resolve();
          }
        });
        presenter.discoverBackfillMatches();
      });

      expect(store.getSnapshot().backfillMatches.every((m) => m.category === "custom")).toBe(true);
    });
  });

  describe("startSeries", () => {
    it("calls service startSeries with trimmed teams and overrides then fires onSeriesStarted", async () => {
      const service = aFakeIndividualTrackerServiceWith();
      const startSeriesSpy = vi.spyOn(service, "startSeries");
      const onSeriesStarted = vi.fn<() => void>();
      const { presenter, store } = buildPresenter(service, onSeriesStarted);

      store.setTitleOverride("Eagle vs Cobra");
      store.setSubtitleOverride("Bo5");
      presenter.setTeamMember(0, 0, "Alpha");
      presenter.setTeamMember(1, 0, "Bravo");

      await new Promise<void>((resolve) => {
        store.subscribe(() => {
          if (!store.getSnapshot().busy) {
            resolve();
          }
        });
        presenter.startSeries();
      });

      expect(startSeriesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          trackerId: "tracker-1",
          titleOverride: "Eagle vs Cobra",
          subtitleOverride: "Bo5",
        }),
      );
      expect(onSeriesStarted).toHaveBeenCalled();
    });

    it("sets submitError when startSeries fails", async () => {
      const service = aFakeIndividualTrackerServiceWith();
      vi.spyOn(service, "startSeries").mockRejectedValue(new Error("Server error"));
      const { presenter, store } = buildPresenter(service);

      await new Promise<void>((resolve) => {
        store.subscribe(() => {
          if (!store.getSnapshot().busy) {
            resolve();
          }
        });
        presenter.startSeries();
      });

      expect(store.getSnapshot().submitError).toBe("Server error");
    });

    it("does nothing after dispose", async () => {
      const service = aFakeIndividualTrackerServiceWith();
      const startSeriesSpy = vi.spyOn(service, "startSeries");
      const { presenter, store } = buildPresenter(service);

      presenter.dispose();
      presenter.startSeries();

      await Promise.resolve();

      expect(startSeriesSpy).not.toHaveBeenCalled();
      expect(store.getSnapshot().busy).toBe(false);
    });
  });

  describe("toggleBackfillMatch", () => {
    it("adds and removes match from selected list", () => {
      const { presenter, store } = buildPresenter(aFakeIndividualTrackerServiceWith());
      presenter.toggleBackfillMatch("match-1");
      expect(store.getSnapshot().selectedBackfillMatchIds).toContain("match-1");
      presenter.toggleBackfillMatch("match-1");
      expect(store.getSnapshot().selectedBackfillMatchIds).not.toContain("match-1");
    });
  });
});
