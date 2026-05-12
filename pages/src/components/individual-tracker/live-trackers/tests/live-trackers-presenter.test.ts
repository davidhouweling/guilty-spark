import { afterEach, describe, expect, it, vi } from "vitest";
import { GameVariantCategory } from "halo-infinite-api";
import type { Services } from "../../../../services/types";
import { aFakeAuthServiceWith } from "../../../../services/auth/fakes/auth.fake";
import { FakeLiveTrackerService } from "../../../../services/live-tracker/fakes/live-tracker.fake";
import { aFakeLiveTrackerScenarioWith } from "../../../../services/live-tracker/fakes/scenario";
import {
  aFakeIndividualTrackerServiceWith,
  aFakeIndividualTrackerStateWith,
} from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import { LiveTrackersPresenter } from "../live-trackers-presenter";
import { LiveTrackersStore } from "../live-trackers-store";

interface Harness {
  readonly store: LiveTrackersStore;
  readonly presenter: LiveTrackersPresenter;
  readonly services: Services;
  readonly navigateTo: ReturnType<typeof vi.fn<(url: string) => void>>;
}

function aHarnessWith(services: Services): Harness {
  const store = new LiveTrackersStore();
  const navigateTo = vi.fn<(url: string) => void>();

  const presenter = new LiveTrackersPresenter({
    services,
    store,
    navigateTo,
    confirmDelete: (): boolean => true,
  });

  return { store, presenter, services, navigateTo };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LiveTrackersPresenter", () => {
  it("refreshes tracker state and builds pinned/live tracker rows", async () => {
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
      authService: aFakeAuthServiceWith(),
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
    harness.presenter.setSessionContext("user-1", "Chief", "2533274844642438");

    await harness.presenter.refresh();

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
      authService: aFakeAuthServiceWith(),
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
    harness.presenter.setSessionContext("user-1", "Chief", "2533274844642438");

    await harness.presenter.refresh();

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
      initialGroupings: [],
      initialSeriesGroups: [],
    });

    harness.presenter.dispose();
  });

  it("syncs selected matches in bulk when adding tracker", async () => {
    const services: Services = {
      authService: aFakeAuthServiceWith(),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith(),
    };

    const syncMatchesSpy = vi.spyOn(services.individualTrackerService, "syncMatchesToTracker");
    const harness = aHarnessWith(services);
    harness.presenter.start();
    harness.presenter.setSessionContext("user-1", "Chief", "2533274844642438");

    await harness.presenter.refresh();

    harness.presenter.openAddDialog();

    await harness.presenter.addTracker({
      gamertag: "NewTag",
      selectedMatchIds: ["m1", "m2"],
      matchGroupings: [["m1", "m2"]],
      matches: [
        {
          matchId: "m1",
          startTime: "Jan 1, 2026, 12:00:00 AM",
          endTime: "Jan 1, 2026, 12:10:00 AM",
          mapAssetId: "map-1",
          mapVersionId: "map-version-1",
          modeAssetId: "mode-1",
          modeVersionId: "mode-version-1",
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
        },
        {
          matchId: "m2",
          startTime: "Jan 1, 2026, 12:15:00 AM",
          endTime: "Jan 1, 2026, 12:25:00 AM",
          mapAssetId: "map-2",
          mapVersionId: "map-version-2",
          modeAssetId: "mode-2",
          modeVersionId: "mode-version-2",
          gameVariantCategory: GameVariantCategory.MultiplayerCtf,
          duration: "10m 0s",
          mapName: "Bazaar",
          modeName: "Capture the Flag",
          outcome: "Loss",
          resultString: "Loss - 3:5",
          isMatchmaking: true,
          category: "matchmaking",
          teams: [],
          mapThumbnailUrl: "data:,",
        },
      ],
    });

    expect(syncMatchesSpy).toHaveBeenCalledWith({
      trackerId: "fake-tracker-id",
      selectedMatchIds: ["m1", "m2"],
      matchGroupings: [["m1", "m2"]],
      matches: [expect.objectContaining({ matchId: "m1" }), expect.objectContaining({ matchId: "m2" })],
    });
    expect(harness.presenter.getSnapshot().isAddDialogOpen).toBe(false);

    harness.presenter.dispose();
  });

  it("updates grouped-series labels when adding tracker", async () => {
    const services: Services = {
      authService: aFakeAuthServiceWith(),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith(),
    };

    const syncMatchesSpy = vi.spyOn(services.individualTrackerService, "syncMatchesToTracker");
    const updateSeriesGroupSpy = vi.spyOn(services.individualTrackerService, "updateSeriesGroup");
    const harness = aHarnessWith(services);
    harness.presenter.start();
    harness.presenter.setSessionContext("user-1", "Chief", "2533274844642438");

    await harness.presenter.refresh();

    harness.presenter.openAddDialog();

    await harness.presenter.addTracker({
      gamertag: "NewTag",
      selectedMatchIds: ["m1", "m2", "m3"],
      matchGroupings: [["m1", "m2"]],
      seriesGroups: [
        {
          matchIds: ["m1", "m2"],
          titleOverride: "Dog Crew",
          subtitleOverride: "Queue #777",
        },
        {
          matchIds: ["m3"],
          titleOverride: "Single Match",
          subtitleOverride: null,
        },
      ],
      matches: [
        {
          matchId: "m1",
          startTime: "Jan 1, 2026, 12:00:00 AM",
          endTime: "Jan 1, 2026, 12:10:00 AM",
          mapAssetId: "map-1",
          mapVersionId: "map-version-1",
          modeAssetId: "mode-1",
          modeVersionId: "mode-version-1",
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
        },
        {
          matchId: "m2",
          startTime: "Jan 1, 2026, 12:15:00 AM",
          endTime: "Jan 1, 2026, 12:25:00 AM",
          mapAssetId: "map-2",
          mapVersionId: "map-version-2",
          modeAssetId: "mode-2",
          modeVersionId: "mode-version-2",
          gameVariantCategory: GameVariantCategory.MultiplayerCtf,
          duration: "10m 0s",
          mapName: "Bazaar",
          modeName: "Capture the Flag",
          outcome: "Loss",
          resultString: "Loss - 3:5",
          isMatchmaking: true,
          category: "matchmaking",
          teams: [],
          mapThumbnailUrl: "data:,",
        },
        {
          matchId: "m3",
          startTime: "Jan 1, 2026, 12:30:00 AM",
          endTime: "Jan 1, 2026, 12:40:00 AM",
          mapAssetId: "map-3",
          mapVersionId: "map-version-3",
          modeAssetId: "mode-3",
          modeVersionId: "mode-version-3",
          gameVariantCategory: 6,
          duration: "10m 0s",
          mapName: "Streets",
          modeName: "Oddball",
          outcome: "Tie",
          resultString: "Tie - 1:1",
          isMatchmaking: false,
          category: "custom",
          teams: [],
          mapThumbnailUrl: "data:,",
        },
      ],
    });

    expect(syncMatchesSpy).toHaveBeenCalledOnce();
    expect(updateSeriesGroupSpy).toHaveBeenCalledOnce();
    expect(updateSeriesGroupSpy).toHaveBeenCalledWith({
      trackerId: "fake-tracker-id",
      matchIds: ["m1", "m2"],
      titleOverride: "Dog Crew",
      subtitleOverride: "Queue #777",
    });

    harness.presenter.dispose();
  });

  it("syncs game selection with a single bulk request", async () => {
    const services: Services = {
      authService: aFakeAuthServiceWith(),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith(),
    };

    const syncMatchesSpy = vi.spyOn(services.individualTrackerService, "syncMatchesToTracker");

    const harness = aHarnessWith(services);
    harness.presenter.start();
    harness.presenter.setSessionContext("user-1", "Chief", "2533274844642438");

    await harness.presenter.refresh();

    harness.store.snapshot = {
      ...harness.store.snapshot,
      gameSelectionDialogState: {
        trackerId: "tracker-1",
        trackerLabel: "Chief",
        xuid: "xuid-1",
        initialSelectedMatchIds: ["m1", "m2"],
        initialGroupings: [["m1", "m2"]],
        initialSeriesGroups: [],
      },
    };

    await harness.presenter.syncGameSelection({
      trackerId: "tracker-1",
      selectedMatchIds: ["m2", "m3"],
      matchGroupings: [["m2", "m3"]],
      matches: [
        {
          matchId: "m2",
          startTime: "Jan 1, 2026, 12:00:00 AM",
          endTime: "Jan 1, 2026, 12:10:00 AM",
          mapAssetId: "map-2",
          mapVersionId: "map-version-2",
          modeAssetId: "mode-2",
          modeVersionId: "mode-version-2",
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
        },
        {
          matchId: "m3",
          startTime: "Jan 1, 2026, 12:15:00 AM",
          endTime: "Jan 1, 2026, 12:25:00 AM",
          mapAssetId: "map-3",
          mapVersionId: "map-version-3",
          modeAssetId: "mode-3",
          modeVersionId: "mode-version-3",
          gameVariantCategory: GameVariantCategory.MultiplayerCtf,
          duration: "10m 0s",
          mapName: "Bazaar",
          modeName: "Capture the Flag",
          outcome: "Loss",
          resultString: "Loss - 3:5",
          isMatchmaking: true,
          category: "matchmaking",
          teams: [],
          mapThumbnailUrl: "data:,",
        },
      ],
    });

    expect(syncMatchesSpy).toHaveBeenCalledWith({
      trackerId: "tracker-1",
      selectedMatchIds: ["m2", "m3"],
      matchGroupings: [["m2", "m3"]],
      matches: [expect.objectContaining({ matchId: "m2" }), expect.objectContaining({ matchId: "m3" })],
    });
    expect(harness.presenter.getSnapshot().busy).toBe(false);

    harness.presenter.dispose();
  });

  it("updates grouped-series labels during sync when labels change without resyncing matches", async () => {
    const services: Services = {
      authService: aFakeAuthServiceWith(),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith({
        trackerStates: {
          "tracker-1": aFakeIndividualTrackerStateWith({
            trackerId: "tracker-1",
            seriesGroups: [
              {
                matchIds: ["m1", "m2"],
                titleOverride: "Old Label",
                subtitleOverride: null,
              },
            ],
          }),
        },
      }),
    };

    const syncMatchesSpy = vi.spyOn(services.individualTrackerService, "syncMatchesToTracker");
    const updateSeriesGroupSpy = vi.spyOn(services.individualTrackerService, "updateSeriesGroup");

    const harness = aHarnessWith(services);
    harness.presenter.start();
    harness.presenter.setSessionContext("user-1", "Chief", "2533274844642438");

    await harness.presenter.refresh();

    harness.store.snapshot = {
      ...harness.store.snapshot,
      gameSelectionDialogState: {
        trackerId: "tracker-1",
        trackerLabel: "Chief",
        xuid: "xuid-1",
        initialSelectedMatchIds: ["m1", "m2"],
        initialGroupings: [["m1", "m2"]],
        initialSeriesGroups: [
          {
            matchIds: ["m1", "m2"],
            titleOverride: "Old Label",
            subtitleOverride: null,
          },
        ],
      },
    };

    await harness.presenter.syncGameSelection({
      trackerId: "tracker-1",
      selectedMatchIds: ["m1", "m2"],
      matchGroupings: [["m1", "m2"]],
      seriesGroups: [
        {
          matchIds: ["m1", "m2"],
          titleOverride: "Dog Crew",
          subtitleOverride: "Queue #777",
        },
      ],
      matches: [
        {
          matchId: "m1",
          startTime: "Jan 1, 2026, 12:00:00 AM",
          endTime: "Jan 1, 2026, 12:10:00 AM",
          mapAssetId: "map-1",
          mapVersionId: "map-version-1",
          modeAssetId: "mode-1",
          modeVersionId: "mode-version-1",
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
        },
        {
          matchId: "m2",
          startTime: "Jan 1, 2026, 12:15:00 AM",
          endTime: "Jan 1, 2026, 12:25:00 AM",
          mapAssetId: "map-2",
          mapVersionId: "map-version-2",
          modeAssetId: "mode-2",
          modeVersionId: "mode-version-2",
          gameVariantCategory: GameVariantCategory.MultiplayerCtf,
          duration: "10m 0s",
          mapName: "Bazaar",
          modeName: "Capture the Flag",
          outcome: "Loss",
          resultString: "Loss - 3:5",
          isMatchmaking: true,
          category: "matchmaking",
          teams: [],
          mapThumbnailUrl: "data:,",
        },
      ],
    });

    expect(syncMatchesSpy).not.toHaveBeenCalled();
    expect(updateSeriesGroupSpy).toHaveBeenCalledOnce();
    expect(updateSeriesGroupSpy).toHaveBeenCalledWith({
      trackerId: "tracker-1",
      matchIds: ["m1", "m2"],
      titleOverride: "Dog Crew",
      subtitleOverride: "Queue #777",
    });
    expect(harness.presenter.getSnapshot().busy).toBe(false);

    harness.presenter.dispose();
  });

  it("skips stale series-group label updates when selected matches no longer form a grouped series", async () => {
    const services: Services = {
      authService: aFakeAuthServiceWith(),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith({
        trackerStates: {
          "tracker-1": aFakeIndividualTrackerStateWith({
            trackerId: "tracker-1",
            matchGroupings: [["m1", "m2"]],
            seriesGroups: [
              {
                matchIds: ["m1", "m2"],
                titleOverride: "Old Label",
                subtitleOverride: null,
              },
            ],
          }),
        },
      }),
    };

    const syncMatchesSpy = vi.spyOn(services.individualTrackerService, "syncMatchesToTracker");
    const updateSeriesGroupSpy = vi.spyOn(services.individualTrackerService, "updateSeriesGroup");

    const harness = aHarnessWith(services);
    harness.presenter.start();
    harness.presenter.setSessionContext("user-1", "Chief", "2533274844642438");

    await harness.presenter.refresh();

    harness.store.snapshot = {
      ...harness.store.snapshot,
      gameSelectionDialogState: {
        trackerId: "tracker-1",
        trackerLabel: "Chief",
        xuid: "xuid-1",
        initialSelectedMatchIds: ["m1", "m2"],
        initialGroupings: [["m1", "m2"]],
        initialSeriesGroups: [
          {
            matchIds: ["m1", "m2"],
            titleOverride: "Old Label",
            subtitleOverride: null,
          },
        ],
      },
    };

    await harness.presenter.syncGameSelection({
      trackerId: "tracker-1",
      selectedMatchIds: ["m1"],
      matchGroupings: [["m1", "m2"]],
      seriesGroups: [
        {
          matchIds: ["m1", "m2"],
          titleOverride: "Dog Crew",
          subtitleOverride: "Queue #777",
        },
      ],
      matches: [
        {
          matchId: "m1",
          startTime: "Jan 1, 2026, 12:00:00 AM",
          endTime: "Jan 1, 2026, 12:10:00 AM",
          mapAssetId: "map-1",
          mapVersionId: "map-version-1",
          modeAssetId: "mode-1",
          modeVersionId: "mode-version-1",
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
        },
      ],
    });

    expect(syncMatchesSpy).toHaveBeenCalledOnce();
    expect(updateSeriesGroupSpy).not.toHaveBeenCalled();
    expect(harness.presenter.getSnapshot().busy).toBe(false);

    harness.presenter.dispose();
  });

  it("resets all section state for unauthenticated users", () => {
    const services: Services = {
      authService: aFakeAuthServiceWith(),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith(),
    };

    const harness = aHarnessWith(services);
    harness.presenter.start();
    harness.presenter.setSessionContext("user-1", "Chief", "2533274844642438");

    harness.store.snapshot = {
      ...harness.store.snapshot,
      userId: "user-1",
      xboxGamertag: "Chief",
      isAddDialogOpen: true,
      errorMessage: "Some error",
    };

    harness.presenter.resetForUnauthenticated();

    expect(harness.presenter.getSnapshot().userId).toBeNull();
    expect(harness.presenter.getSnapshot().xboxGamertag).toBeNull();
    expect(harness.presenter.getSnapshot().isAddDialogOpen).toBe(false);
    expect(harness.presenter.getSnapshot().errorMessage).toBeNull();

    harness.presenter.dispose();
  });
});
