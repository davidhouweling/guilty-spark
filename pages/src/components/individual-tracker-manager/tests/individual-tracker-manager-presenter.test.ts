import { afterEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import {
  aFakeIndividualTrackerServiceWith,
  aFakeTrackerProfileWith,
  aFakeTrackerWith,
} from "../../../services/individual-tracker/fakes/individual-tracker.fake";
import type { FakeIndividualTrackerService } from "../../../services/individual-tracker/fakes/individual-tracker.fake";
import type { FakeIndividualTrackerSettingsService } from "../../../services/individual-tracker/fakes/settings.fake";
import { aFakeIndividualTrackerSettingsServiceWith } from "../../../services/individual-tracker/fakes/settings.fake";
import { IndividualTrackerManagerPresenter } from "../individual-tracker-manager-presenter";
import { IndividualTrackerManagerStore } from "../individual-tracker-manager-store";

interface Harness {
  readonly service: FakeIndividualTrackerService;
  readonly settingsService: FakeIndividualTrackerSettingsService;
  readonly store: IndividualTrackerManagerStore;
  readonly presenter: IndividualTrackerManagerPresenter;
}

function aHarness(
  service: FakeIndividualTrackerService,
  settingsService?: FakeIndividualTrackerSettingsService,
): Harness {
  const resolvedSettingsService = settingsService ?? aFakeIndividualTrackerSettingsServiceWith();
  const store = new IndividualTrackerManagerStore();
  const presenter = new IndividualTrackerManagerPresenter({
    individualTrackerService: service,
    settingsService: resolvedSettingsService,
    store,
  });
  return { service, settingsService: resolvedSettingsService, store, presenter };
}

describe("IndividualTrackerManagerPresenter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("start", () => {
    it("loads the profile and trackers into a loaded snapshot", async () => {
      const { store, presenter } = aHarness(
        aFakeIndividualTrackerServiceWith({
          profile: aFakeTrackerProfileWith({ name: "Spartan Profile" }),
          trackers: [aFakeTrackerWith({ trackerId: "t-1", gamertag: "Alpha" })],
        }),
      );

      presenter.start();
      await vi.waitFor(() => {
        expect(store.getSnapshot().status).toBe(ComponentLoaderStatus.LOADED);
      });

      const snapshot = store.getSnapshot();
      expect(snapshot.profileName).toBe("Spartan Profile");
      expect(snapshot.trackers.map((tracker) => tracker.gamertag)).toStrictEqual(["Alpha"]);
      expect(snapshot.errorMessage).toBeNull();
    });

    it("loads settings into the snapshot alongside the profile and trackers", async () => {
      const settingsService = aFakeIndividualTrackerSettingsServiceWith({ styleFlags: { colorMode: "observer" } });
      const { store, presenter } = aHarness(aFakeIndividualTrackerServiceWith({ trackers: [] }), settingsService);

      presenter.start();
      await vi.waitFor(() => {
        expect(store.getSnapshot().status).toBe(ComponentLoaderStatus.LOADED);
      });

      expect(store.getSnapshot().settings).toStrictEqual({ styleFlags: { colorMode: "observer" } });
    });

    it("sets an error snapshot when loading the tracker list fails", async () => {
      const service = aFakeIndividualTrackerServiceWith({ trackers: [] });
      vi.spyOn(service, "listTrackers").mockRejectedValue(new Error("Trackers unavailable"));
      const { store, presenter } = aHarness(service);

      presenter.start();
      await vi.waitFor(() => {
        expect(store.getSnapshot().status).toBe(ComponentLoaderStatus.ERROR);
      });

      expect(store.getSnapshot().errorMessage).toBe("Trackers unavailable");
    });
  });

  describe("addTracker", () => {
    it("does not call the service when the gamertag input is empty", () => {
      const service = aFakeIndividualTrackerServiceWith({ trackers: [] });
      const startSpy: MockInstance = vi.spyOn(service, "startTracker");
      const { store, presenter } = aHarness(service);

      store.setGamertagInput("   ");
      presenter.addTracker();

      expect(startSpy).not.toHaveBeenCalled();
    });

    it("starts a tracker with the trimmed gamertag, refreshes the list, and clears the input", async () => {
      const service = aFakeIndividualTrackerServiceWith({ trackers: [] });
      const startSpy: MockInstance = vi.spyOn(service, "startTracker");
      const { store, presenter } = aHarness(service);

      store.setGamertagInput("  New Recruit  ");
      presenter.addTracker();

      await vi.waitFor(() => {
        expect(store.getSnapshot().addPending).toBe(false);
      });

      expect(startSpy).toHaveBeenCalledWith({ gamertag: "New Recruit" });
      expect(store.getSnapshot().trackers.map((tracker) => tracker.gamertag)).toStrictEqual(["New Recruit"]);
      expect(store.getSnapshot().gamertagInput).toBe("");
    });

    it("sets an error snapshot when starting the tracker fails", async () => {
      const service = aFakeIndividualTrackerServiceWith({ trackers: [] });
      vi.spyOn(service, "startTracker").mockRejectedValue(new Error("Start failed"));
      const { store, presenter } = aHarness(service);

      store.setGamertagInput("New Recruit");
      presenter.addTracker();

      await vi.waitFor(() => {
        expect(store.getSnapshot().status).toBe(ComponentLoaderStatus.ERROR);
      });

      expect(store.getSnapshot().errorMessage).toBe("Start failed");
    });

    it("closes the dialog and clears all fields on success", async () => {
      const service = aFakeIndividualTrackerServiceWith({ trackers: [] });
      const { store, presenter } = aHarness(service);

      presenter.openAddDialog();
      store.setGamertagInput("New Recruit");
      store.setSearchStartTime("2026-01-02T03:04");
      store.setIdleTimeoutHours("12");
      presenter.addTracker();

      await vi.waitFor(() => {
        expect(store.getSnapshot().addPending).toBe(false);
      });

      expect(store.getSnapshot().isAddDialogOpen).toBe(false);
      expect(store.getSnapshot().gamertagInput).toBe("");
      expect(store.getSnapshot().searchStartTime).toBe("");
      expect(store.getSnapshot().idleTimeoutHours).toBe("");
    });

    it("omits idleTimeoutHours when blank and includes a parsed searchStartTime when provided", async () => {
      const service = aFakeIndividualTrackerServiceWith({ trackers: [] });
      const startSpy: MockInstance = vi.spyOn(service, "startTracker");
      const { store, presenter } = aHarness(service);

      store.setGamertagInput("New Recruit");
      store.setSearchStartTime("2026-01-02T03:04");
      store.setIdleTimeoutHours("   ");
      presenter.addTracker();

      await vi.waitFor(() => {
        expect(store.getSnapshot().addPending).toBe(false);
      });

      expect(startSpy).toHaveBeenCalledWith({
        gamertag: "New Recruit",
        searchStartTime: new Date("2026-01-02T03:04").toISOString(),
      });
    });

    it("includes a parsed idleTimeoutHours when provided", async () => {
      const service = aFakeIndividualTrackerServiceWith({ trackers: [] });
      const startSpy: MockInstance = vi.spyOn(service, "startTracker");
      const { store, presenter } = aHarness(service);

      store.setGamertagInput("New Recruit");
      store.setIdleTimeoutHours("12");
      presenter.addTracker();

      await vi.waitFor(() => {
        expect(store.getSnapshot().addPending).toBe(false);
      });

      expect(startSpy).toHaveBeenCalledWith({ gamertag: "New Recruit", idleTimeoutHours: 12 });
    });

    it("does not call the service when the searchStartTime is not a valid datetime", () => {
      const service = aFakeIndividualTrackerServiceWith({ trackers: [] });
      const startSpy: MockInstance = vi.spyOn(service, "startTracker");
      const { store, presenter } = aHarness(service);

      store.setGamertagInput("New Recruit");
      store.setSearchStartTime("not-a-date");
      presenter.addTracker();

      expect(startSpy).not.toHaveBeenCalled();
    });

    it("does not call the service when the idleTimeoutHours is not a positive number", () => {
      const service = aFakeIndividualTrackerServiceWith({ trackers: [] });
      const startSpy: MockInstance = vi.spyOn(service, "startTracker");
      const { store, presenter } = aHarness(service);

      store.setGamertagInput("New Recruit");
      store.setIdleTimeoutHours("-3");
      presenter.addTracker();

      expect(startSpy).not.toHaveBeenCalled();
    });
  });

  describe("openAddDialog / closeAddDialog", () => {
    it("opens the dialog and resets the fields", () => {
      const service = aFakeIndividualTrackerServiceWith({ trackers: [] });
      const { store, presenter } = aHarness(service);

      store.setGamertagInput("Stale");
      store.setSearchStartTime("2026-01-02T03:04");
      store.setIdleTimeoutHours("9");
      presenter.openAddDialog();

      expect(store.getSnapshot().isAddDialogOpen).toBe(true);
      expect(store.getSnapshot().gamertagInput).toBe("");
      expect(store.getSnapshot().searchStartTime).toBe("");
      expect(store.getSnapshot().idleTimeoutHours).toBe("");
    });

    it("closes the dialog and resets the fields", () => {
      const service = aFakeIndividualTrackerServiceWith({ trackers: [] });
      const { store, presenter } = aHarness(service);

      presenter.openAddDialog();
      store.setGamertagInput("Stale");
      presenter.closeAddDialog();

      expect(store.getSnapshot().isAddDialogOpen).toBe(false);
      expect(store.getSnapshot().gamertagInput).toBe("");
    });
  });

  describe("runRowAction", () => {
    it("calls stopTracker then refreshes the list", async () => {
      const service = aFakeIndividualTrackerServiceWith({
        trackers: [aFakeTrackerWith({ trackerId: "t-1", gamertag: "Alpha" })],
      });
      const stopSpy: MockInstance = vi.spyOn(service, "stopTracker");
      const { store, presenter } = aHarness(service);

      presenter.runRowAction("t-1", "stop");

      await vi.waitFor(() => {
        expect(store.getSnapshot().pendingTrackerId).toBeNull();
      });
      expect(stopSpy).toHaveBeenCalledWith("t-1");
      expect(store.getSnapshot().trackers).toHaveLength(0);
    });

    it("calls pauseTracker then refreshes the list", async () => {
      const service = aFakeIndividualTrackerServiceWith({
        trackers: [aFakeTrackerWith({ trackerId: "t-1", status: "active" })],
      });
      const pauseSpy: MockInstance = vi.spyOn(service, "pauseTracker");
      const listSpy: MockInstance = vi.spyOn(service, "listTrackers");
      const { store, presenter } = aHarness(service);

      presenter.runRowAction("t-1", "pause");

      await vi.waitFor(() => {
        expect(store.getSnapshot().pendingTrackerId).toBeNull();
      });
      expect(pauseSpy).toHaveBeenCalledWith("t-1");
      expect(listSpy).toHaveBeenCalled();
    });

    it("calls resumeTracker then refreshes the list", async () => {
      const service = aFakeIndividualTrackerServiceWith({
        trackers: [aFakeTrackerWith({ trackerId: "t-1", status: "paused" })],
      });
      const resumeSpy: MockInstance = vi.spyOn(service, "resumeTracker");
      const listSpy: MockInstance = vi.spyOn(service, "listTrackers");
      const { store, presenter } = aHarness(service);

      presenter.runRowAction("t-1", "resume");

      await vi.waitFor(() => {
        expect(store.getSnapshot().pendingTrackerId).toBeNull();
      });
      expect(resumeSpy).toHaveBeenCalledWith("t-1");
      expect(listSpy).toHaveBeenCalled();
    });

    it("calls selectActive then refreshes the list", async () => {
      const service = aFakeIndividualTrackerServiceWith({
        trackers: [
          aFakeTrackerWith({ trackerId: "t-1", isLive: true }),
          aFakeTrackerWith({ trackerId: "t-2", isLive: false }),
        ],
      });
      const selectActiveSpy: MockInstance = vi.spyOn(service, "selectActive");
      const { store, presenter } = aHarness(service);

      presenter.runRowAction("t-2", "setLive");

      await vi.waitFor(() => {
        expect(store.getSnapshot().pendingTrackerId).toBeNull();
      });
      expect(selectActiveSpy).toHaveBeenCalledWith("t-2");
      const live = store.getSnapshot().trackers.find((tracker) => tracker.isLive);
      expect(live?.trackerId).toBe("t-2");
    });

    it("sets an error snapshot when the row action fails", async () => {
      const service = aFakeIndividualTrackerServiceWith({
        trackers: [aFakeTrackerWith({ trackerId: "t-1" })],
      });
      vi.spyOn(service, "stopTracker").mockRejectedValue(new Error("Stop failed"));
      const { store, presenter } = aHarness(service);

      presenter.runRowAction("t-1", "stop");

      await vi.waitFor(() => {
        expect(store.getSnapshot().status).toBe(ComponentLoaderStatus.ERROR);
      });
      expect(store.getSnapshot().errorMessage).toBe("Stop failed");
    });
  });

  describe("dispose", () => {
    it("ignores store writes from a load that resolves after dispose", async () => {
      const service = aFakeIndividualTrackerServiceWith({
        trackers: [aFakeTrackerWith({ trackerId: "t-1", gamertag: "Alpha" })],
      });
      const { store, presenter } = aHarness(service);

      presenter.start();
      presenter.dispose();

      await vi.waitFor(() => {
        expect(service).toBeDefined();
      });

      expect(store.getSnapshot().status).toBe(ComponentLoaderStatus.LOADING);
      expect(store.getSnapshot().trackers).toHaveLength(0);
    });

    it("ignores gamertag input updates after dispose", () => {
      const service = aFakeIndividualTrackerServiceWith({ trackers: [] });
      const { store, presenter } = aHarness(service);

      presenter.dispose();
      presenter.setGamertagInput("New Recruit");

      expect(store.getSnapshot().gamertagInput).toBe("");
    });

    it("ignores addTracker after dispose", () => {
      const service = aFakeIndividualTrackerServiceWith({ trackers: [] });
      const startSpy = vi.spyOn(service, "startTracker");
      const { store, presenter } = aHarness(service);

      presenter.setGamertagInput("New Recruit");
      presenter.dispose();
      presenter.addTracker();

      expect(startSpy).not.toHaveBeenCalled();
      expect(store.getSnapshot().addPending).toBe(false);
    });
  });
});

describe("IndividualTrackerManagerPresenter.present", () => {
  it("derives a view model that disables adding while a request is pending", () => {
    const store = new IndividualTrackerManagerStore();
    store.setGamertagInput("New Recruit");
    store.setAddPending(true);

    const model = IndividualTrackerManagerPresenter.present(store.getSnapshot());

    expect(model.profileName).toBe("");
    expect(model.gamertagInput).toBe("New Recruit");
    expect(model.addPending).toBe(true);
    expect(model.addDisabled).toBe(true);
  });

  it("enables adding when there is valid input below the limit and no pending request", () => {
    const store = new IndividualTrackerManagerStore();
    store.setLoaded("Profile", [aFakeTrackerWith({ trackerId: "t-1" })]);
    store.setGamertagInput("New Recruit");

    const model = IndividualTrackerManagerPresenter.present(store.getSnapshot());

    expect(model.model.rows).toHaveLength(1);
    expect(model.addDisabled).toBe(false);
  });

  it("includes settings fields from the snapshot", () => {
    const store = new IndividualTrackerManagerStore();
    store.setSettings({ styleFlags: { colorMode: "observer" } });
    store.setSettingsSaving(true);
    store.setSettingsError("Save failed");

    const model = IndividualTrackerManagerPresenter.present(store.getSnapshot());

    expect(model.settings).toStrictEqual({ styleFlags: { colorMode: "observer" } });
    expect(model.settingsSaving).toBe(true);
    expect(model.settingsError).toBe("Save failed");
  });
});

describe("IndividualTrackerManagerPresenter updateSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sets settingsSaving to true, saves, then clears settingsSaving and updates settings", async () => {
    const service = aFakeIndividualTrackerServiceWith({ trackers: [] });
    const { store, presenter } = aHarness(service);

    presenter.updateSettings({ styleFlags: { colorMode: "observer" } });

    expect(store.getSnapshot().settingsSaving).toBe(true);

    await vi.waitFor(() => {
      expect(store.getSnapshot().settingsSaving).toBe(false);
    });

    expect(store.getSnapshot().settings).toStrictEqual({ styleFlags: { colorMode: "observer" } });
    expect(store.getSnapshot().settingsError).toBeNull();
  });

  it("sets settingsError when the save fails", async () => {
    const service = aFakeIndividualTrackerServiceWith({ trackers: [] });
    const settingsService = aFakeIndividualTrackerSettingsServiceWith();
    vi.spyOn(settingsService, "updateSettings").mockRejectedValue(new Error("Network error"));
    const { store, presenter } = aHarness(service, settingsService);

    presenter.updateSettings({ styleFlags: { colorMode: "player" } });

    await vi.waitFor(() => {
      expect(store.getSnapshot().settingsSaving).toBe(false);
    });

    expect(store.getSnapshot().settingsError).toBe("Network error");
  });

  it("ignores the result after dispose", async () => {
    const service = aFakeIndividualTrackerServiceWith({ trackers: [] });
    const { store, presenter } = aHarness(service);
    const updateSpy = vi.spyOn(store, "setSettings");

    presenter.updateSettings({ styleFlags: { colorMode: "observer" } });
    presenter.dispose();

    await Promise.resolve();
    await Promise.resolve();

    expect(updateSpy).not.toHaveBeenCalled();
    expect(store.getSnapshot().settings).toStrictEqual({});
  });
});
