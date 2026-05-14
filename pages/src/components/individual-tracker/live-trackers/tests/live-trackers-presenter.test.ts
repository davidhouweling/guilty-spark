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
  it("shows start-series or end-series action based on current series context", async () => {
    const activeTracker = aFakeIndividualTrackerStateWith({
      trackerId: "tracker-series",
      gamertag: "SeriesPlayer",
      status: "active",
      activeNeatQueueSeries: {
        titleOverride: null,
        subtitleOverride: null,
        neatQueueSeriesData: {
          seriesId: { guildId: "manual-tracker-series", queueNumber: 0 },
          teams: [
            { name: "Eagle", playerIds: ["p-1"] },
            { name: "Cobra", playerIds: ["p-2"] },
          ],
          seriesScore: "0:0",
          matchIds: [],
          playersAssociationData: {},
          substitutions: [],
          startTime: "2026-01-01T00:00:00.000Z",
          lastUpdateTime: "2026-01-01T00:00:00.000Z",
        },
      },
    });

    const nonSeriesTracker = aFakeIndividualTrackerStateWith({
      trackerId: "tracker-non-series",
      gamertag: "NoSeriesPlayer",
      status: "active",
    });

    const services: Services = {
      authService: aFakeAuthServiceWith(),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith({
        activeState: nonSeriesTracker,
        trackerReferences: {
          "tracker-series": { gamertag: "SeriesPlayer" },
          "tracker-non-series": { gamertag: "NoSeriesPlayer" },
        },
        trackerStates: {
          "tracker-series": activeTracker,
          "tracker-non-series": nonSeriesTracker,
        },
      }),
    };

    const harness = aHarnessWith(services);
    harness.presenter.start();
    harness.presenter.setSessionContext("user-1", "Chief", "2533274844642438");

    await harness.presenter.refresh();

    const rows = harness.presenter.getTrackerItems();
    const seriesRow = rows.find((item) => item.trackerId === "tracker-series");
    const nonSeriesRow = rows.find((item) => item.trackerId === "tracker-non-series");

    expect(seriesRow).toBeDefined();
    expect(nonSeriesRow).toBeDefined();

    if (seriesRow == null || nonSeriesRow == null) {
      throw new Error("Expected tracker rows to exist");
    }

    const seriesActions = harness.presenter.getActions(seriesRow).map((action) => action.label);
    const nonSeriesActions = harness.presenter.getActions(nonSeriesRow).map((action) => action.label);

    expect(seriesActions).toContain("End series");
    expect(seriesActions).not.toContain("Start series");
    expect(nonSeriesActions).toContain("Start series");
    expect(nonSeriesActions).not.toContain("End series");

    const startSeriesAction = harness.presenter
      .getActions(nonSeriesRow)
      .find((action) => action.label === "Start series");
    expect(startSeriesAction).toBeDefined();

    startSeriesAction?.onClick();

    expect(harness.presenter.getSnapshot().manualSeriesDialogState).toEqual({
      trackerId: "tracker-non-series",
      trackerLabel: "NoSeriesPlayer",
    });

    harness.presenter.dispose();
  });

  it("ends series from row action and updates tracker state", async () => {
    const activeTracker = aFakeIndividualTrackerStateWith({
      trackerId: "tracker-series",
      gamertag: "SeriesPlayer",
      status: "active",
      activeNeatQueueSeries: {
        titleOverride: null,
        subtitleOverride: null,
        neatQueueSeriesData: {
          seriesId: { guildId: "manual-tracker-series", queueNumber: 0 },
          teams: [
            { name: "Eagle", playerIds: ["p-1"] },
            { name: "Cobra", playerIds: ["p-2"] },
          ],
          seriesScore: "0:0",
          matchIds: [],
          playersAssociationData: {},
          substitutions: [],
          startTime: "2026-01-01T00:00:00.000Z",
          lastUpdateTime: "2026-01-01T00:00:00.000Z",
        },
      },
    });

    const services: Services = {
      authService: aFakeAuthServiceWith(),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith({
        activeState: activeTracker,
        trackerReferences: {
          "tracker-series": { gamertag: "SeriesPlayer" },
        },
        trackerStates: {
          "tracker-series": activeTracker,
        },
      }),
    };

    const endSeriesSpy = vi.spyOn(services.individualTrackerService, "endSeries").mockResolvedValue({
      success: true,
      state: aFakeIndividualTrackerStateWith({
        trackerId: "tracker-series",
        gamertag: "SeriesPlayer",
        status: "active",
      }),
    });

    const harness = aHarnessWith(services);
    harness.presenter.start();
    harness.presenter.setSessionContext("user-1", "Chief", "2533274844642438");

    await harness.presenter.refresh();

    const row = harness.presenter.getTrackerItems().find((item) => item.trackerId === "tracker-series");
    expect(row).toBeDefined();
    if (row == null) {
      throw new Error("Expected tracker row to exist");
    }

    const endSeriesAction = harness.presenter.getActions(row).find((action) => action.label === "End series");
    expect(endSeriesAction).toBeDefined();

    endSeriesAction?.onClick();
    await Promise.resolve();
    await Promise.resolve();

    expect(endSeriesSpy).toHaveBeenCalledWith("tracker-series");
    expect(harness.presenter.getSnapshot().trackerStatuses["tracker-series"]?.activeNeatQueueSeries).toBeUndefined();

    harness.presenter.dispose();
  });

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
