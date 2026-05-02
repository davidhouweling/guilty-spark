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

interface Harness {
  readonly store: IndividualTrackerStore;
  readonly presenter: IndividualTrackerPresenter;
  readonly services: Services;
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

function aHarnessWith(services: Services, controller: LiveTrackersController = aLiveTrackersControllerMock()): Harness {
  const store = new IndividualTrackerStore();
  const assignLocation = vi.fn<(url: string) => void>();

  const presenter = new IndividualTrackerPresenter({
    services,
    store,
    liveTrackersController: controller,
    assignLocation,
  });

  return { store, presenter, services, assignLocation, liveTrackersController: controller };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("IndividualTrackerPresenter", () => {
  it("enters follow-active viewer mode when mode=active query param is present", async () => {
    window.history.pushState({}, "", "/individual-tracker?mode=active");

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
        activeState: aFakeIndividualTrackerStateWith({
          userId: "user-1",
          trackerId: "active-1",
          gamertag: "Chief",
        }),
      }),
    };

    const harness = aHarnessWith(services);
    harness.presenter.start();

    await waitFor(() => {
      const snapshot = harness.presenter.getSnapshot();
      expect(snapshot.authState).toBe("authenticated");
      expect(snapshot.mode).toBe("view");
      expect(snapshot.viewSource).toBe("active");
      expect(snapshot.viewTrackerId).toBe("active-1");
      expect(snapshot.viewerRenderModel).not.toBeNull();
    });

    window.history.pushState({}, "", "/individual-tracker");
  });

  it("enters viewer mode when tracker query param is present", async () => {
    window.history.pushState({}, "", "/individual-tracker?tracker=tracker-123");

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

    const harness = aHarnessWith(services);
    harness.presenter.start();

    await waitFor(() => {
      const snapshot = harness.presenter.getSnapshot();
      expect(snapshot.authState).toBe("authenticated");
      expect(snapshot.mode).toBe("view");
      expect(snapshot.viewSource).toBe("tracker");
      expect(snapshot.viewTrackerId).toBe("tracker-123");
      expect(snapshot.viewerRenderModel).not.toBeNull();
    });

    window.history.pushState({}, "", "/individual-tracker");
  });

  it("loads authenticated session and coordinates child controller", async () => {
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

    const liveTrackersController = aLiveTrackersControllerMock();
    const harness = aHarnessWith(services, liveTrackersController);

    harness.presenter.start();

    await waitFor(() => {
      expect(harness.presenter.getSnapshot().authState).toBe("authenticated");
    });

    expect(liveTrackersController.start).toHaveBeenCalledOnce();
    expect(liveTrackersController.setSessionContext).toHaveBeenCalledWith("user-1", "Chief");
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
});
