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
        teamColor: "jade",
        enemyColor: "tangelo",
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

    await harness.presenter.updateStreamerPresentationSettings("player", false, false, false);

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

    const snapshot = harness.presenter.getSnapshot();
    expect(snapshot.viewerDefaultColorMode).toBe("player");
    expect(snapshot.viewerShowTabs).toBe(false);
    expect(snapshot.viewerShowTicker).toBe(false);
    expect(snapshot.viewerShowTeamDetails).toBe(false);
    expect(snapshot.viewerSettingsErrorMessage).toBeNull();
    expect(snapshot.viewerSettingsSaving).toBe(false);
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
