import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tracker, TrackerState } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import type { FakeIndividualTrackerService } from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import {
  aFakeTrackerWith,
  aFakeIndividualTrackerServiceWith,
} from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import { LiveTrackersPresenter } from "../live-trackers-presenter";
import { LiveTrackersStore } from "../live-trackers-store";

function aFakeTrackerState(opts: {
  trackerId: string;
  gamertag: string;
  status: Tracker["status"];
  isLive?: boolean;
  hasActiveSeries?: boolean;
}): TrackerState {
  return {
    userId: "u1",
    trackerId: opts.trackerId,
    xuid: "xuid-1",
    gamertag: opts.gamertag,
    status: opts.status,
    isPaused: opts.status === "paused",
    startTime: "2026-01-01T00:00:00.000Z",
    lastUpdateTime: "2026-01-01T00:00:00.000Z",
    idleTimeoutHours: 6,
    hasActiveSeries: opts.hasActiveSeries ?? false,
  };
}

interface Harness {
  service: FakeIndividualTrackerService;
  store: LiveTrackersStore;
  presenter: LiveTrackersPresenter;
  navigateTo: (url: string) => void;
}

function aHarness(opts: { trackers?: Tracker[]; xboxGamertag?: string | null; xboxXuid?: string | null }): Harness {
  const service = aFakeIndividualTrackerServiceWith({ trackers: opts.trackers });
  const store = new LiveTrackersStore();
  const navigateTo = vi.fn<(url: string) => void>();
  const presenter = new LiveTrackersPresenter({
    individualTrackerService: service,
    store,
    navigateTo,
    confirmDelete: (): boolean => true,
  });
  return { service, store, presenter, navigateTo };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LiveTrackersPresenter", () => {
  it("refresh populates trackerItems from the service tracker list", async () => {
    const tracker = aFakeTrackerWith({
      trackerId: "t1",
      gamertag: "Chief",
      status: "active",
      isLive: true,
      state: aFakeTrackerState({ trackerId: "t1", gamertag: "Chief", status: "active" }),
    });
    const { presenter } = aHarness({ trackers: [tracker], xboxGamertag: null });

    presenter.start();
    presenter.setSessionContext("u1", null, null);
    await presenter.refresh();

    const items = presenter.getTrackerItems();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ trackerId: "t1", gamertag: "Chief", status: "active" });

    presenter.dispose();
  });

  it("getTrackerItems pins the current user's tracker and marks live correctly", async () => {
    const pinnedTracker = aFakeTrackerWith({
      trackerId: "t1",
      gamertag: "Chief",
      status: "paused",
      isLive: false,
      state: aFakeTrackerState({ trackerId: "t1", gamertag: "Chief", status: "paused" }),
    });
    const liveTracker = aFakeTrackerWith({
      trackerId: "t2",
      gamertag: "Other",
      status: "active",
      isLive: true,
      state: aFakeTrackerState({ trackerId: "t2", gamertag: "Other", status: "active" }),
    });
    const { presenter } = aHarness({ trackers: [pinnedTracker, liveTracker], xboxGamertag: "Chief" });

    presenter.start();
    presenter.setSessionContext("u1", "Chief", "xuid-1");
    await presenter.refresh();

    const items = presenter.getTrackerItems();
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      trackerId: "t1",
      gamertag: "Chief",
      status: "paused",
      isLive: false,
      isPinned: true,
    });
    expect(items[1]).toMatchObject({
      trackerId: "t2",
      gamertag: "Other",
      status: "active",
      isLive: true,
      isPinned: false,
    });

    presenter.dispose();
  });

  it("getActions returns correct actions for an active tracker with no series", async () => {
    const tracker = aFakeTrackerWith({
      trackerId: "t1",
      gamertag: "Chief",
      status: "active",
      isLive: true,
      state: aFakeTrackerState({ trackerId: "t1", gamertag: "Chief", status: "active" }),
    });
    const { presenter } = aHarness({ trackers: [tracker] });

    presenter.start();
    presenter.setSessionContext("u1", null, null);
    await presenter.refresh();

    const items = presenter.getTrackerItems();
    expect(items).toHaveLength(1);

    const actionLabels = presenter.getActions(items[0]).map((a) => a.label);
    expect(actionLabels).toContain("Pause");
    expect(actionLabels).toContain("Stop tracker");
    expect(actionLabels).not.toContain("End series");
    expect(actionLabels).toContain("Game selection");
    expect(actionLabels).toContain("Start series");
    expect(actionLabels).not.toContain("Resume");
    expect(actionLabels).not.toContain("Start tracker");

    presenter.dispose();
  });

  it("getActions includes End series but not Start series when tracker has an active series", async () => {
    const tracker = aFakeTrackerWith({
      trackerId: "t1",
      gamertag: "Chief",
      status: "active",
      isLive: true,
      state: aFakeTrackerState({ trackerId: "t1", gamertag: "Chief", status: "active", hasActiveSeries: true }),
    });
    const { presenter } = aHarness({ trackers: [tracker] });

    presenter.start();
    presenter.setSessionContext("u1", null, null);
    await presenter.refresh();

    const items = presenter.getTrackerItems();
    const actionLabels = presenter.getActions(items[0]).map((a) => a.label);
    expect(actionLabels).toContain("End series");
    expect(actionLabels).not.toContain("Start series");

    presenter.dispose();
  });

  it("openAddDialog sets isAddDialogOpen to true; closeAddDialog clears it", () => {
    const { presenter } = aHarness({});

    presenter.start();
    expect(presenter.getSnapshot().isAddDialogOpen).toBe(false);

    presenter.openAddDialog();
    expect(presenter.getSnapshot().isAddDialogOpen).toBe(true);

    presenter.closeAddDialog();
    expect(presenter.getSnapshot().isAddDialogOpen).toBe(false);

    presenter.dispose();
  });

  it("Game selection action opens gameSelectionDialogState for active tracker with known xuid", async () => {
    const tracker = aFakeTrackerWith({
      trackerId: "t1",
      gamertag: "Chief",
      status: "active",
      isLive: true,
      state: aFakeTrackerState({ trackerId: "t1", gamertag: "Chief", status: "active" }),
    });
    const { presenter } = aHarness({ trackers: [tracker] });

    presenter.start();
    presenter.setSessionContext("u1", null, null);
    await presenter.refresh();

    const [item] = presenter.getTrackerItems();
    expect(item).toBeDefined();

    const gameSelectionAction = presenter.getActions(item).find((a) => a.label === "Game selection");
    expect(gameSelectionAction).toBeDefined();
    if (gameSelectionAction == null) {
      return;
    }

    gameSelectionAction.onClick();

    const { gameSelectionDialogState } = presenter.getSnapshot();
    expect(gameSelectionDialogState).not.toBeNull();
    expect(gameSelectionDialogState?.trackerId).toBe("t1");
    expect(gameSelectionDialogState?.trackerLabel).toBe("Chief");
    expect(gameSelectionDialogState?.xuid).toBe("xuid-1");

    presenter.closeGameSelectionDialog();
    expect(presenter.getSnapshot().gameSelectionDialogState).toBeNull();

    presenter.dispose();
  });

  it("Start series action opens manualSeriesDialogState for active tracker", async () => {
    const tracker = aFakeTrackerWith({
      trackerId: "t1",
      gamertag: "Chief",
      status: "active",
      isLive: true,
      state: aFakeTrackerState({ trackerId: "t1", gamertag: "Chief", status: "active" }),
    });
    const { presenter } = aHarness({ trackers: [tracker] });

    presenter.start();
    presenter.setSessionContext("u1", null, null);
    await presenter.refresh();

    const [item] = presenter.getTrackerItems();
    expect(item).toBeDefined();

    const startSeriesAction = presenter.getActions(item).find((a) => a.label === "Start series");
    expect(startSeriesAction).toBeDefined();
    if (startSeriesAction == null) {
      return;
    }

    startSeriesAction.onClick();

    const { manualSeriesDialogState } = presenter.getSnapshot();
    expect(manualSeriesDialogState).not.toBeNull();
    expect(manualSeriesDialogState?.trackerId).toBe("t1");
    expect(manualSeriesDialogState?.trackerLabel).toBe("Chief");

    presenter.closeManualSeriesDialog();
    expect(presenter.getSnapshot().manualSeriesDialogState).toBeNull();

    presenter.dispose();
  });

  it("deleteTracker action calls service and refreshes", async () => {
    const tracker = aFakeTrackerWith({
      trackerId: "t1",
      gamertag: "Chief",
      status: "active",
      isLive: false,
      state: aFakeTrackerState({ trackerId: "t1", gamertag: "Chief", status: "active" }),
    });
    const { presenter, service } = aHarness({ trackers: [tracker] });
    const deleteTrackerSpy = vi.spyOn(service, "deleteTracker");

    presenter.start();
    presenter.setSessionContext("u1", null, null);
    await presenter.refresh();

    const item = presenter.getTrackerItems().find((i) => i.trackerId === "t1");
    expect(item).toBeDefined();
    if (item == null) {
      return;
    }

    const deleteAction = presenter.getActions(item).find((a) => a.label === "Delete tracker");
    expect(deleteAction).toBeDefined();
    if (deleteAction == null) {
      return;
    }

    deleteAction.onClick();
    await Promise.resolve();
    await Promise.resolve();

    expect(deleteTrackerSpy).toHaveBeenCalledWith("t1");

    presenter.dispose();
  });

  it("auto-selects as live when only one tracker exists after start", async () => {
    const { service, presenter } = aHarness({ trackers: [] });

    presenter.start();
    presenter.setSessionContext("u1", "Chief", "xuid-1");
    await presenter.refresh();

    const selectActiveSpy = vi.spyOn(service, "selectActive");

    const items = presenter.getTrackerItems();
    const startAction = presenter.getActions(items[0]).find((a) => a.label === "Start tracker");
    expect(startAction).toBeDefined();
    if (startAction == null) {
      return;
    }

    startAction.onClick();
    await vi.waitFor(() => {
      expect(presenter.getSnapshot().activeTracker).not.toBeNull();
    });

    expect(selectActiveSpy).toHaveBeenCalledTimes(1);

    presenter.dispose();
  });

  it("does not auto-select when there are multiple trackers after start", async () => {
    const existingTracker = aFakeTrackerWith({ trackerId: "t1", gamertag: "Arbiter", isLive: true });
    const { service, presenter } = aHarness({ trackers: [existingTracker] });

    presenter.start();
    presenter.setSessionContext("u1", "Chief", "xuid-1");
    await presenter.refresh();

    const selectActiveSpy = vi.spyOn(service, "selectActive");

    const items = presenter.getTrackerItems();
    const stoppedItem = items.find((i) => i.gamertag === "Chief");
    expect(stoppedItem).toBeDefined();
    if (stoppedItem == null) {
      return;
    }

    const startAction = presenter.getActions(stoppedItem).find((a) => a.label === "Start tracker");
    expect(startAction).toBeDefined();
    if (startAction == null) {
      return;
    }

    startAction.onClick();
    await vi.waitFor(() => {
      expect(presenter.getSnapshot().runningTrackers.some((t) => t.gamertag === "Chief")).toBe(true);
    });

    expect(selectActiveSpy).not.toHaveBeenCalled();

    presenter.dispose();
  });

  it("resetForUnauthenticated clears all session state", async () => {
    const tracker = aFakeTrackerWith({ trackerId: "t1", gamertag: "Chief" });
    const { presenter, store } = aHarness({ trackers: [tracker] });

    presenter.start();
    presenter.setSessionContext("u1", "Chief", "xuid-1");
    await presenter.refresh();

    expect(presenter.getSnapshot().userId).toBe("u1");
    expect(presenter.getTrackerItems().length).toBeGreaterThan(0);

    presenter.resetForUnauthenticated();

    expect(presenter.getSnapshot().userId).toBeNull();
    expect(presenter.getSnapshot().xboxGamertag).toBeNull();
    expect(presenter.getSnapshot().errorMessage).toBeNull();
    expect(store.snapshot.runningTrackers).toHaveLength(0);

    presenter.dispose();
  });
});
