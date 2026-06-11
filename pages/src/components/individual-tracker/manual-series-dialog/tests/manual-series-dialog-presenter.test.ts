import { describe, expect, it, vi } from "vitest";
import type { IndividualTrackerService } from "../../../../services/individual-tracker/types";
import { aFakeIndividualTrackerServiceWith } from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import {
  aFakeIndividualTrackerViewServiceWith,
  aFakeTrackerMatchSummaryWith,
  aFakeTrackerViewStateWith,
} from "../../../../services/individual-tracker/fakes/view.fake";
import { ManualSeriesDialogPresenter } from "../manual-series-dialog-presenter";
import { ManualSeriesDialogStore } from "../manual-series-dialog-store";

function buildPresenter(
  service: IndividualTrackerService,
  onSeriesStarted = vi.fn<() => void>(),
  viewServiceOverride?: ReturnType<typeof aFakeIndividualTrackerViewServiceWith>,
): { presenter: ManualSeriesDialogPresenter; store: ManualSeriesDialogStore } {
  const store = new ManualSeriesDialogStore();
  const viewService = viewServiceOverride ?? aFakeIndividualTrackerViewServiceWith();
  const presenter = new ManualSeriesDialogPresenter({
    trackerId: "tracker-1",
    store,
    individualTrackerService: service,
    viewService,
    onSeriesStarted,
  });
  return { presenter, store };
}

describe("ManualSeriesDialogStore", () => {
  it("defaults to start mode", () => {
    const store = new ManualSeriesDialogStore();
    expect(store.getSnapshot().mode).toBe("start");
  });

  it("is edit mode when initialData is provided", () => {
    const store = new ManualSeriesDialogStore({ title: "My Series", subtitle: "Bo3", teams: [] });
    expect(store.getSnapshot().mode).toBe("edit");
    expect(store.getSnapshot().titleOverride).toBe("My Series");
  });

  it("reset restores to initial data in edit mode", () => {
    const store = new ManualSeriesDialogStore({ title: "Original", subtitle: "Bo3", teams: [] });
    store.setTitleOverride("Changed");
    store.reset();
    expect(store.getSnapshot().titleOverride).toBe("Original");
  });
});

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
    it("loads tracker matches from viewService.getView", async () => {
      const match = aFakeTrackerMatchSummaryWith({ matchId: "tracker-match-1" });
      const viewService = aFakeIndividualTrackerViewServiceWith({
        view: aFakeTrackerViewStateWith({ matches: [match] }),
      });
      const service = aFakeIndividualTrackerServiceWith();
      const { presenter, store } = buildPresenter(service, vi.fn(), viewService);

      await new Promise<void>((resolve) => {
        store.subscribe(() => {
          const s = store.getSnapshot();
          if (s.backfillState === "done" || s.backfillState === "error") {
            resolve();
          }
        });
        presenter.discoverBackfillMatches();
      });

      expect(store.getSnapshot().backfillState).toBe("done");
      expect(store.getSnapshot().backfillMatches).toHaveLength(1);
      expect(store.getSnapshot().backfillMatches[0].matchId).toBe("tracker-match-1");
    });

    it("filters out matchmaking matches", async () => {
      const customMatch = aFakeTrackerMatchSummaryWith({ matchId: "custom-1", isMatchmaking: false });
      const matchmakingMatch = aFakeTrackerMatchSummaryWith({ matchId: "mm-1", isMatchmaking: true });
      const viewService = aFakeIndividualTrackerViewServiceWith({
        view: aFakeTrackerViewStateWith({ matches: [customMatch, matchmakingMatch] }),
      });
      const { presenter, store } = buildPresenter(aFakeIndividualTrackerServiceWith(), vi.fn(), viewService);

      await new Promise<void>((resolve) => {
        store.subscribe(() => {
          const s = store.getSnapshot();
          if (s.backfillState === "done" || s.backfillState === "error") {
            resolve();
          }
        });
        presenter.discoverBackfillMatches();
      });

      expect(store.getSnapshot().backfillState).toBe("done");
      expect(store.getSnapshot().backfillMatches).toHaveLength(1);
      expect(store.getSnapshot().backfillMatches[0].matchId).toBe("custom-1");
    });

    it("sorts matches most-recent-first", async () => {
      const older = aFakeTrackerMatchSummaryWith({ matchId: "old", startTime: "2100-01-01T00:00:00.000Z" });
      const newer = aFakeTrackerMatchSummaryWith({ matchId: "new", startTime: "2100-01-02T00:00:00.000Z" });
      const viewService = aFakeIndividualTrackerViewServiceWith({
        view: aFakeTrackerViewStateWith({ matches: [older, newer] }),
      });
      const { presenter, store } = buildPresenter(aFakeIndividualTrackerServiceWith(), vi.fn(), viewService);

      await new Promise<void>((resolve) => {
        store.subscribe(() => {
          const s = store.getSnapshot();
          if (s.backfillState === "done" || s.backfillState === "error") {
            resolve();
          }
        });
        presenter.discoverBackfillMatches();
      });

      expect(store.getSnapshot().backfillMatches.map((m) => m.matchId)).toEqual(["new", "old"]);
    });

    it("sets error when tracker has no matches", async () => {
      const viewService = aFakeIndividualTrackerViewServiceWith({
        view: aFakeTrackerViewStateWith({ matches: [] }),
      });
      const { presenter, store } = buildPresenter(aFakeIndividualTrackerServiceWith(), vi.fn(), viewService);

      await new Promise<void>((resolve) => {
        store.subscribe(() => {
          const s = store.getSnapshot();
          if (s.backfillState === "done" || s.backfillState === "error") {
            resolve();
          }
        });
        presenter.discoverBackfillMatches();
      });

      expect(store.getSnapshot().backfillState).toBe("done");
      expect(store.getSnapshot().backfillError).toBeTruthy();
    });

    it("sets error when getView throws", async () => {
      const viewService = aFakeIndividualTrackerViewServiceWith();
      vi.spyOn(viewService, "getView").mockRejectedValue(new Error("Network error"));
      const { presenter, store } = buildPresenter(aFakeIndividualTrackerServiceWith(), vi.fn(), viewService);

      await new Promise<void>((resolve) => {
        store.subscribe(() => {
          const s = store.getSnapshot();
          if (s.backfillState !== "idle" && s.backfillState !== "loading") {
            resolve();
          }
        });
        presenter.discoverBackfillMatches();
      });

      expect(store.getSnapshot().backfillState).toBe("error");
      expect(store.getSnapshot().backfillError).toBeTruthy();
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

  describe("editSeries", () => {
    it("calls service editSeries with trimmed values then fires onSeriesEdited", async () => {
      const service = aFakeIndividualTrackerServiceWith();
      const editSeriesSpy = vi.spyOn(service, "editSeries");
      const onSeriesEdited = vi.fn<() => void>();
      const store = new ManualSeriesDialogStore();
      const presenter = new ManualSeriesDialogPresenter({
        trackerId: "tracker-1",
        store,
        individualTrackerService: service,
        viewService: aFakeIndividualTrackerViewServiceWith(),
        onSeriesStarted: vi.fn(),
        onSeriesEdited,
      });

      store.setTitleOverride("Eagle vs Cobra");
      store.setSubtitleOverride("Bo5");
      presenter.setTeamMember(0, 0, "Alpha");

      await new Promise<void>((resolve) => {
        store.subscribe(() => {
          if (!store.getSnapshot().busy) {
            resolve();
          }
        });
        presenter.editSeries();
      });

      expect(editSeriesSpy).toHaveBeenCalledWith(
        "tracker-1",
        expect.objectContaining({ titleOverride: "Eagle vs Cobra", subtitleOverride: "Bo5" }),
      );
      expect(onSeriesEdited).toHaveBeenCalled();
    });

    it("omits teams from the request when all teams are blank", async () => {
      const service = aFakeIndividualTrackerServiceWith();
      const editSeriesSpy = vi.spyOn(service, "editSeries");
      const { presenter, store } = buildPresenter(service);

      store.setTitleOverride("Title Only");

      await new Promise<void>((resolve) => {
        store.subscribe(() => {
          if (!store.getSnapshot().busy) {
            resolve();
          }
        });
        presenter.editSeries();
      });

      expect(editSeriesSpy).toHaveBeenCalledWith(
        "tracker-1",
        expect.not.objectContaining({ teams: expect.anything() }),
      );
    });

    it("includes teams when at least one team has data", async () => {
      const service = aFakeIndividualTrackerServiceWith();
      const editSeriesSpy = vi.spyOn(service, "editSeries");
      const { presenter, store } = buildPresenter(service);

      presenter.setTeamMember(0, 0, "Alpha");

      await new Promise<void>((resolve) => {
        store.subscribe(() => {
          if (!store.getSnapshot().busy) {
            resolve();
          }
        });
        presenter.editSeries();
      });

      expect(editSeriesSpy).toHaveBeenCalledWith("tracker-1", expect.objectContaining({ teams: expect.any(Array) }));
    });

    it("sets submitError when editSeries fails", async () => {
      const service = aFakeIndividualTrackerServiceWith();
      vi.spyOn(service, "editSeries").mockRejectedValue(new Error("Server error"));
      const { presenter, store } = buildPresenter(service);

      await new Promise<void>((resolve) => {
        store.subscribe(() => {
          if (!store.getSnapshot().busy) {
            resolve();
          }
        });
        presenter.editSeries();
      });

      expect(store.getSnapshot().submitError).toBe("Server error");
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
