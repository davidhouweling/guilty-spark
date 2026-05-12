import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { Services } from "../../../services/types";
import type {
  IndividualTrackerConnection,
  IndividualTrackerStateListener,
  IndividualTrackerStatusListener,
  IndividualTrackerSubscription,
  TrackerSearchResult,
} from "../../../services/individual-tracker/types";
import { aFakeAuthServiceWith } from "../../../services/auth/fakes/auth.fake";
import { FakeLiveTrackerService } from "../../../services/live-tracker/fakes/live-tracker.fake";
import { aFakeLiveTrackerScenarioWith } from "../../../services/live-tracker/fakes/scenario";
import {
  aFakeIndividualTrackerServiceWith,
  aFakeIndividualTrackerStateWith,
} from "../../../services/individual-tracker/fakes/individual-tracker.fake";
import type { LiveTrackersController } from "../live-trackers/types";
import { IndividualTrackerPresenter } from "../individual-tracker-presenter";
import { IndividualTrackerStore } from "../individual-tracker-store";
import type { IndividualTrackerAppRoute } from "../routes";

interface Harness {
  readonly store: IndividualTrackerStore;
  readonly presenter: IndividualTrackerPresenter;
  readonly services: Services;
  readonly navigateTo: ReturnType<typeof vi.fn<(url: string) => void>>;
  readonly assignLocation: ReturnType<typeof vi.fn<(url: string) => void>>;
  readonly liveTrackersController: LiveTrackersController;
}

class TestIndividualTrackerConnection implements IndividualTrackerConnection {
  private readonly stateListeners = new Set<IndividualTrackerStateListener>();
  private readonly statusListeners = new Set<IndividualTrackerStatusListener>();

  public subscribe(listener: IndividualTrackerStateListener): IndividualTrackerSubscription {
    this.stateListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.stateListeners.delete(listener);
      },
    };
  }

  public subscribeStatus(listener: IndividualTrackerStatusListener): IndividualTrackerSubscription {
    this.statusListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.statusListeners.delete(listener);
      },
    };
  }

  public disconnect(): void {
    this.stateListeners.clear();
    this.statusListeners.clear();
  }

  public emitState(state: ReturnType<typeof aFakeIndividualTrackerStateWith>): void {
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }
}

function createDeferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolveValue!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolveValue = resolve;
  });

  return {
    promise,
    resolve: resolveValue,
  };
}

function aLiveTrackersControllerMock(): LiveTrackersController {
  return {
    start: vi.fn<LiveTrackersController["start"]>(),
    dispose: vi.fn<LiveTrackersController["dispose"]>(),
    setSessionContext: vi.fn<LiveTrackersController["setSessionContext"]>(),
    resetForUnauthenticated: vi.fn<LiveTrackersController["resetForUnauthenticated"]>(),
    refresh: vi.fn<LiveTrackersController["refresh"]>(async () => Promise.resolve()),
  };
}

function aHarnessWith(
  services: Services,
  controller: LiveTrackersController = aLiveTrackersControllerMock(),
  route: IndividualTrackerAppRoute = { kind: "manage" },
): Harness {
  const store = new IndividualTrackerStore();
  const navigateTo = vi.fn<(url: string) => void>();
  const assignLocation = vi.fn<(url: string) => void>();

  const presenter = new IndividualTrackerPresenter({
    services,
    store,
    liveTrackersController: controller,
    initialRoute: route,
    navigateTo,
    assignLocation,
  });

  return { store, presenter, services, navigateTo, assignLocation, liveTrackersController: controller };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("IndividualTrackerPresenter", () => {
  it("enters follow-active viewer mode when the active route is selected", async () => {
    const services: Services = {
      authService: aFakeAuthServiceWith({
        session: {
          authenticated: true,
          userId: "user-1",
          xboxGamertag: "Chief",
          xboxXuid: "2533274844642438",
        },
      }),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith({
        activeState: aFakeIndividualTrackerStateWith({
          userId: "user-1",
          trackerId: "active-1",
          gamertag: "Chief",
        }),
      }),
    };

    const harness = aHarnessWith(services, aLiveTrackersControllerMock(), { kind: "view-active" });
    harness.presenter.start();

    await waitFor(() => {
      const snapshot = harness.presenter.getSnapshot();
      expect(snapshot.authState).toBe("authenticated");
      expect(snapshot.mode).toBe("view");
      expect(snapshot.viewSource).toBe("active");
      expect(snapshot.viewTrackerId).toBe("active-1");
      expect(snapshot.viewerRenderModel).not.toBeNull();
      expect(snapshot.viewerTopBarStats).toHaveLength(6);
      expect(snapshot.viewerTopBarStats[0]?.option).toBe("matches-win-loss");
    });
  });

  it("enters viewer mode when a tracker route is selected", async () => {
    const services: Services = {
      authService: aFakeAuthServiceWith({
        session: {
          authenticated: true,
          userId: "user-1",
          xboxGamertag: "Chief",
          xboxXuid: "2533274844642438",
        },
      }),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith({
        trackerStates: {
          "tracker-123": {
            userId: "user-1",
            trackerId: "tracker-123",
            xuid: "xuid-1",
            gamertag: "Chief",
            status: "active",
            isPaused: false,
            startTime: "2026-01-01T00:00:00.000Z",
            lastUpdateTime: "2026-01-01T00:05:00.000Z",
            searchStartTime: "2026-01-01T00:00:00.000Z",
            lastMatchDiscoveredAt: "2026-01-01T00:05:00.000Z",
            checkCount: 2,
            idleTimeoutHours: 1,
            discoveredMatches: {},
            matchIds: [],
            matchGroupings: [],
            seriesGroups: [],
            excludedMatchIds: [],
            errorState: {
              consecutiveErrors: 0,
              backoffMinutes: 3,
              lastSuccessTime: "2026-01-01T00:05:00.000Z",
            },
            refreshInProgress: undefined,
            refreshStartedAt: undefined,
          },
        },
      }),
    };

    const harness = aHarnessWith(services, aLiveTrackersControllerMock(), {
      kind: "view-tracker",
      trackerId: "tracker-123",
    });
    harness.presenter.start();

    await waitFor(() => {
      const snapshot = harness.presenter.getSnapshot();
      expect(snapshot.authState).toBe("authenticated");
      expect(snapshot.mode).toBe("view");
      expect(snapshot.viewSource).toBe("tracker");
      expect(snapshot.viewTrackerId).toBe("tracker-123");
      expect(snapshot.viewerRenderModel).not.toBeNull();
    });
  });

  it("keeps existing tracker summary visible while fetching an updated summary", async () => {
    const initialState = aFakeIndividualTrackerStateWith({
      userId: "user-1",
      trackerId: "active-1",
      xuid: "xuid-1",
      gamertag: "Chief",
    });

    const nextState = aFakeIndividualTrackerStateWith({
      userId: "user-1",
      trackerId: "active-1",
      xuid: "xuid-1",
      gamertag: "ChiefNext",
    });

    const connection = new TestIndividualTrackerConnection();

    const individualTrackerService = aFakeIndividualTrackerServiceWith({
      activeState: initialState,
    });
    vi.spyOn(individualTrackerService, "connectToActiveTracker").mockReturnValue(connection);

    const initialSummary: TrackerSearchResult = {
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
    };

    const nextSummary: TrackerSearchResult = {
      ...initialSummary,
      gamertag: "ChiefNext",
    };

    const nextSummaryDeferred = createDeferred<TrackerSearchResult | null>();
    const searchGamertagSpy = vi.spyOn(individualTrackerService, "searchGamertag");
    searchGamertagSpy.mockResolvedValueOnce(initialSummary);
    searchGamertagSpy.mockReturnValueOnce(nextSummaryDeferred.promise);

    const services: Services = {
      authService: aFakeAuthServiceWith({
        session: {
          authenticated: true,
          userId: "user-1",
          xboxGamertag: "Chief",
          xboxXuid: "2533274844642438",
        },
      }),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService,
    };

    const harness = aHarnessWith(services, aLiveTrackersControllerMock(), { kind: "view-active" });
    harness.presenter.start();

    await waitFor(() => {
      expect(harness.presenter.getSnapshot().viewerTrackerSummary?.gamertag).toBe("Chief");
    });

    connection.emitState(nextState);

    await waitFor(() => {
      expect(harness.presenter.getSnapshot().viewTrackerGamertag).toBe("ChiefNext");
    });

    expect(harness.presenter.getSnapshot().viewerTrackerSummary?.gamertag).toBe("Chief");

    nextSummaryDeferred.resolve(nextSummary);

    await waitFor(() => {
      expect(harness.presenter.getSnapshot().viewerTrackerSummary?.gamertag).toBe("ChiefNext");
    });
  });

  it("loads authenticated session and coordinates child controller", async () => {
    const services: Services = {
      authService: aFakeAuthServiceWith({
        session: {
          authenticated: true,
          userId: "user-1",
          xboxGamertag: "Chief",
          xboxXuid: "2533274844642438",
        },
      }),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith(),
    };

    const liveTrackersController = aLiveTrackersControllerMock();
    const harness = aHarnessWith(services, liveTrackersController);

    harness.presenter.start();

    await waitFor(() => {
      expect(harness.presenter.getSnapshot().authState).toBe("authenticated");
    });

    expect(liveTrackersController.start).toHaveBeenCalledOnce();
    expect(liveTrackersController.setSessionContext).toHaveBeenCalledWith("user-1", "Chief", "2533274844642438");
    expect(liveTrackersController.refresh).toHaveBeenCalledOnce();

    harness.presenter.dispose();

    expect(liveTrackersController.dispose).toHaveBeenCalledOnce();
  });

  it("resets child controller when session is unauthenticated", async () => {
    const services: Services = {
      authService: aFakeAuthServiceWith({
        session: {
          authenticated: false,
        },
      }),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith(),
    };

    const liveTrackersController = aLiveTrackersControllerMock();
    const harness = aHarnessWith(services, liveTrackersController);

    harness.presenter.start();

    await waitFor(() => {
      expect(harness.presenter.getSnapshot().authState).toBe("unauthenticated");
    });

    expect(liveTrackersController.resetForUnauthenticated).toHaveBeenCalledOnce();
    expect(liveTrackersController.refresh).not.toHaveBeenCalled();

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

  it("navigates back to the manage route when exiting viewer mode", () => {
    const services: Services = {
      authService: aFakeAuthServiceWith(),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService: aFakeIndividualTrackerServiceWith(),
    };

    const harness = aHarnessWith(services, aLiveTrackersControllerMock(), { kind: "view-active" });

    harness.presenter.exitViewerMode();

    expect(harness.navigateTo).toHaveBeenCalledWith("/");
  });

  it("updates and persists viewer team colors", async () => {
    const individualTrackerService = aFakeIndividualTrackerServiceWith({
      profile: {
        ProfileId: "profile-1",
        UserId: "user-1",
        ActiveIdentityId: null,
        Name: "default",
        CreatedAt: 1,
        UpdatedAt: 1,
      },
    });

    const updateSettingsSpy = vi.spyOn(individualTrackerService, "updateStreamerViewSettings");

    const services: Services = {
      authService: aFakeAuthServiceWith({
        session: {
          authenticated: true,
          userId: "user-1",
          xboxGamertag: "Chief",
          xboxXuid: "2533274844642438",
        },
      }),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService,
    };

    const harness = aHarnessWith(services);
    harness.presenter.start();

    await waitFor(() => {
      expect(harness.presenter.getSnapshot().authState).toBe("authenticated");
    });

    await harness.presenter.updateViewerColors("jade", "tangelo");

    expect(updateSettingsSpy).toHaveBeenCalledWith({
      profileId: "profile-1",
      styleFlags: {
        playerTeamColor: "jade",
        playerEnemyColor: "tangelo",
      },
    });

    const snapshot = harness.presenter.getSnapshot();
    expect(snapshot.viewerTeamColor).toBe("jade");
    expect(snapshot.viewerEnemyColor).toBe("tangelo");
    expect(snapshot.viewerSettingsErrorMessage).toBeNull();
    expect(snapshot.viewerSettingsSaving).toBe(false);
  });

  it("updates and persists streamer presentation settings", async () => {
    const individualTrackerService = aFakeIndividualTrackerServiceWith({
      profile: {
        ProfileId: "profile-1",
        UserId: "user-1",
        ActiveIdentityId: null,
        Name: "default",
        CreatedAt: 1,
        UpdatedAt: 1,
      },
    });

    const updateSettingsSpy = vi.spyOn(individualTrackerService, "updateStreamerViewSettings");

    const services: Services = {
      authService: aFakeAuthServiceWith({
        session: {
          authenticated: true,
          userId: "user-1",
          xboxGamertag: "Chief",
          xboxXuid: "2533274844642438",
        },
      }),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService,
    };

    const harness = aHarnessWith(services);
    harness.presenter.start();

    await waitFor(() => {
      expect(harness.presenter.getSnapshot().authState).toBe("authenticated");
    });

    harness.presenter.updateStreamerPresentationSettings("player", false, false, false);
    await waitFor(() => {
      expect(updateSettingsSpy).toHaveBeenCalledWith({
        profileId: "profile-1",
        layoutOptions: {
          defaultColorMode: "player",
        },
        visibleSections: {
          showTabs: false,
          showTicker: false,
          showTeamDetails: false,
        },
      });
    });

    const snapshot = harness.presenter.getSnapshot();
    expect(snapshot.viewerDefaultColorMode).toBe("player");
    expect(snapshot.viewerShowTabs).toBe(false);
    expect(snapshot.viewerShowTicker).toBe(false);
    expect(snapshot.viewerShowTeamDetails).toBe(false);
    expect(snapshot.viewerSettingsErrorMessage).toBeNull();
    expect(snapshot.viewerSettingsSaving).toBe(false);
  });

  it("creates a default profile when none exists and then saves presentation settings", async () => {
    const defaultProfile = {
      ProfileId: "profile-1",
      UserId: "user-1",
      ActiveIdentityId: null,
      Name: "default",
      CreatedAt: 1,
      UpdatedAt: 1,
    } as const;

    const individualTrackerService = aFakeIndividualTrackerServiceWith({
      profile: defaultProfile,
    });

    const getProfileSpy = vi
      .spyOn(individualTrackerService, "getProfile")
      .mockResolvedValueOnce({ profile: null, games: [] })
      .mockResolvedValue({ profile: defaultProfile, games: [] });
    const createProfileSpy = vi.spyOn(individualTrackerService, "createProfile");
    const updateSettingsSpy = vi.spyOn(individualTrackerService, "updateStreamerViewSettings");

    const services: Services = {
      authService: aFakeAuthServiceWith({
        session: {
          authenticated: true,
          userId: "user-1",
          xboxGamertag: "Chief",
          xboxXuid: "2533274844642438",
        },
      }),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService,
    };

    const harness = aHarnessWith(services);
    harness.presenter.start();

    await waitFor(() => {
      expect(harness.presenter.getSnapshot().authState).toBe("authenticated");
      expect(harness.presenter.getSnapshot().profileId).toBe("profile-1");
    });

    expect(getProfileSpy).toHaveBeenCalled();
    expect(createProfileSpy).toHaveBeenCalledWith({});

    harness.presenter.updateStreamerPresentationSettings("player", true, true, true);
    await waitFor(() => {
      expect(updateSettingsSpy).toHaveBeenCalledWith({
        profileId: "profile-1",
        layoutOptions: {
          defaultColorMode: "player",
        },
        visibleSections: {
          showTabs: true,
          showTicker: true,
          showTeamDetails: true,
        },
      });
    });

    expect(harness.presenter.getSnapshot().viewerSettingsErrorMessage).toBeNull();
  });

  it("updates and persists active tracker observer color overrides", async () => {
    const individualTrackerService = aFakeIndividualTrackerServiceWith({
      profile: {
        ProfileId: "profile-1",
        UserId: "user-1",
        ActiveIdentityId: null,
        Name: "default",
        CreatedAt: 1,
        UpdatedAt: 1,
      },
      activeState: aFakeIndividualTrackerStateWith({
        trackerId: "tracker-1",
        gamertag: "Chief",
      }),
    });

    const updateSettingsSpy = vi.spyOn(individualTrackerService, "updateStreamerViewSettings");

    const services: Services = {
      authService: aFakeAuthServiceWith({
        session: {
          authenticated: true,
          userId: "user-1",
          xboxGamertag: "Chief",
          xboxXuid: "2533274844642438",
        },
      }),
      liveTrackerService: new FakeLiveTrackerService(aFakeLiveTrackerScenarioWith({ frames: [] })),
      individualTrackerService,
    };

    const harness = aHarnessWith(services);
    harness.presenter.start();

    await waitFor(() => {
      expect(harness.presenter.getSnapshot().settingsActiveTrackerId).toBe("tracker-1");
    });

    await harness.presenter.updateActiveTrackerObserverOverride("jade", "tangelo");

    expect(updateSettingsSpy).toHaveBeenCalledWith({
      profileId: "profile-1",
      styleFlags: {
        observerColorOverrides: {
          "tracker-1": {
            teamColor: "jade",
            enemyColor: "tangelo",
          },
        },
      },
    });

    const snapshot = harness.presenter.getSnapshot();
    expect(snapshot.viewerObserverOverrideTeamColor).toBe("jade");
    expect(snapshot.viewerObserverOverrideEnemyColor).toBe("tangelo");
    expect(snapshot.viewerSettingsErrorMessage).toBeNull();
  });
});
