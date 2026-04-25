import { afterEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { Services } from "../../../services/types";
import { aFakeAuthServiceWith } from "../../../services/auth/fakes/auth.fake";
import { FakeLiveTrackerService } from "../../../services/live-tracker/fakes/live-tracker.fake";
import { aFakeLiveTrackerScenarioWith } from "../../../services/live-tracker/fakes/scenario";
import { aFakeIndividualTrackerServiceWith } from "../../../services/individual-tracker/fakes/individual-tracker.fake";
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
});
