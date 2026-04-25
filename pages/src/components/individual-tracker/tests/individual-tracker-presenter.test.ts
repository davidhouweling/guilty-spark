import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { Services } from "../../../services/types";
import { aFakeAuthServiceWith } from "../../../services/auth/fakes/auth.fake";
import { FakeLiveTrackerService } from "../../../services/live-tracker/fakes/live-tracker.fake";
import { aFakeLiveTrackerScenarioWith } from "../../../services/live-tracker/fakes/scenario";
import {
  aFakeIndividualTrackerServiceWith,
  aFakeIndividualTrackerStateWith,
} from "../../../services/individual-tracker/fakes/individual-tracker.fake";
import { IndividualTrackerPresenter } from "../individual-tracker-presenter";
import { IndividualTrackerStore } from "../individual-tracker-store";

interface Harness {
  readonly store: IndividualTrackerStore;
  readonly presenter: IndividualTrackerPresenter;
  readonly services: Services;
  readonly assignLocation: ReturnType<typeof vi.fn<(url: string) => void>>;
}

function aHarnessWith(services: Services): Harness {
  const store = new IndividualTrackerStore();
  const assignLocation = vi.fn<(url: string) => void>();

  const presenter = new IndividualTrackerPresenter({
    services,
    store,
    assignLocation,
    confirmDelete: (): boolean => true,
  });

  return { store, presenter, services, assignLocation };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("IndividualTrackerPresenter", () => {
  it("loads authenticated tracker state and builds pinned/live tracker rows", async () => {
    const activeTracker = aFakeIndividualTrackerStateWith({
      trackerId: "tracker-2",
      gamertag: "Other",
      xuid: "xuid-2",
      status: "active",
      matchIds: ["m1", "m2"],
    });

    const pinnedTracker = aFakeIndividualTrackerStateWith({
      trackerId: "tracker-1",
      gamertag: "Chief",
      xuid: "xuid-1",
      status: "paused",
    });

    const services: Services = {
      authService: aFakeAuthServiceWith({
        session: {
          authenticated: true,
          userId: "user-1",
          xboxGamertag: "Chief",
        },
      }),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith({
        activeState: activeTracker,
        trackerReferences: {
          "tracker-1": { gamertag: "Chief" },
          "tracker-2": { gamertag: "Other" },
        },
        trackerStates: {
          "tracker-1": pinnedTracker,
          "tracker-2": activeTracker,
        },
      }),
    };

    const harness = aHarnessWith(services);

    harness.presenter.start();

    await waitFor(() => {
      expect(harness.presenter.getSnapshot().authState).toBe("authenticated");
    });

    const rows = harness.presenter.getTrackerItems();

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      trackerId: "tracker-1",
      gamertag: "Chief",
      status: "paused",
      isLive: false,
      isPinned: true,
    });
    expect(rows[1]).toMatchObject({
      trackerId: "tracker-2",
      gamertag: "Other",
      status: "active",
      isLive: true,
      isPinned: false,
    });

    harness.presenter.dispose();
  });

  it("opens game selection from row action with current tracker state", async () => {
    const activeTracker = aFakeIndividualTrackerStateWith({
      trackerId: "tracker-2",
      gamertag: "Other",
      xuid: "xuid-2",
      status: "active",
      matchIds: ["m10", "m11"],
    });

    const services: Services = {
      authService: aFakeAuthServiceWith({
        session: {
          authenticated: true,
          userId: "user-1",
          xboxGamertag: "Chief",
        },
      }),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith({
        activeState: activeTracker,
        trackerReferences: {
          "tracker-2": { gamertag: "Other" },
        },
        trackerStates: {
          "tracker-2": activeTracker,
        },
      }),
    };

    const harness = aHarnessWith(services);
    harness.presenter.start();

    await waitFor(() => {
      expect(harness.presenter.getSnapshot().authState).toBe("authenticated");
    });

    const row = harness.presenter.getTrackerItems().find((item) => item.trackerId === "tracker-2");
    expect(row).toBeDefined();
    if (row == null) {
      throw new Error("Expected tracker row to exist");
    }

    const gameSelectionAction = harness.presenter.getActions(row).find((action) => action.label === "Game selection");

    expect(gameSelectionAction).toBeDefined();

    gameSelectionAction?.onClick();

    expect(harness.presenter.getSnapshot().gameSelectionDialogState).toEqual({
      trackerId: "tracker-2",
      trackerLabel: "Other",
      xuid: "xuid-2",
      initialSelectedMatchIds: ["m10", "m11"],
    });

    harness.presenter.dispose();
  });

  it("adds selected matches when adding tracker", async () => {
    const services: Services = {
      authService: aFakeAuthServiceWith({
        session: {
          authenticated: true,
          userId: "user-1",
          xboxGamertag: "Chief",
        },
      }),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith(),
    };

    const addMatchSpy = vi.spyOn(services.individualTrackerService, "addMatchToTracker");
    const harness = aHarnessWith(services);
    harness.presenter.start();

    await waitFor(() => {
      expect(harness.presenter.getSnapshot().authState).toBe("authenticated");
    });

    harness.presenter.openAddDialog();

    await harness.presenter.addTracker({ gamertag: "NewTag", selectedMatchIds: ["m1", "m2"] });

    expect(addMatchSpy).toHaveBeenNthCalledWith(1, "fake-tracker-id", "m1");
    expect(addMatchSpy).toHaveBeenNthCalledWith(2, "fake-tracker-id", "m2");
    expect(harness.presenter.getSnapshot().isAddDialogOpen).toBe(false);

    harness.presenter.dispose();
  });

  it("syncs game selection by adding and removing only changed matches", async () => {
    const services: Services = {
      authService: aFakeAuthServiceWith({
        session: {
          authenticated: true,
          userId: "user-1",
          xboxGamertag: "Chief",
        },
      }),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith(),
    };

    const addMatchSpy = vi.spyOn(services.individualTrackerService, "addMatchToTracker");
    const removeMatchSpy = vi.spyOn(services.individualTrackerService, "removeMatchFromTracker");

    const harness = aHarnessWith(services);
    harness.presenter.start();

    await waitFor(() => {
      expect(harness.presenter.getSnapshot().authState).toBe("authenticated");
    });

    harness.store.snapshot = {
      ...harness.store.snapshot,
      gameSelectionDialogState: {
        trackerId: "tracker-1",
        trackerLabel: "Chief",
        xuid: "xuid-1",
        initialSelectedMatchIds: ["m1", "m2"],
      },
    };

    await harness.presenter.syncGameSelection({
      trackerId: "tracker-1",
      selectedMatchIds: ["m2", "m3"],
    });

    expect(addMatchSpy).toHaveBeenCalledWith("tracker-1", "m3");
    expect(removeMatchSpy).toHaveBeenCalledWith("tracker-1", "m1");
    expect(harness.presenter.getSnapshot().busy).toBe(false);

    harness.presenter.dispose();
  });

  it("starts microsoft auth and assigns returned url", async () => {
    const services: Services = {
      authService: aFakeAuthServiceWith(),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith(),
    };

    const harness = aHarnessWith(services);

    await harness.presenter.signIn();

    expect(harness.assignLocation).toHaveBeenCalledWith(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
  });
});
