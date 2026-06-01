import type { AuthService } from "../auth/types";
import type { IndividualTrackerService } from "../individual-tracker/types";
import type { LiveTrackerService } from "../live-tracker/types";

interface FakeServices {
  readonly authService: AuthService;
  readonly individualTrackerService: IndividualTrackerService;
  readonly liveTrackerService: LiveTrackerService;
}

export async function installFakeServices(): Promise<FakeServices> {
  const [
    { FakeAuthService },
    { FakeIndividualTrackerService, aFakeTrackerWith },
    { FakeLiveTrackerService },
    { createSampleScenario },
  ] = await Promise.all([
    import("../auth/fakes/auth.fake"),
    import("../individual-tracker/fakes/individual-tracker.fake"),
    import("../live-tracker/fakes/live-tracker.fake"),
    import("../live-tracker/fakes/scenario"),
  ]);

  const scenario = createSampleScenario();

  return {
    authService: new FakeAuthService(),
    individualTrackerService: new FakeIndividualTrackerService({
      trackers: [
        aFakeTrackerWith({
          trackerId: "fake-tracker-1",
          gamertag: "Fake Spartan",
          xuid: "2533274800000001",
          status: "active",
          isLive: true,
        }),
        aFakeTrackerWith({
          trackerId: "fake-tracker-2",
          gamertag: "Master Chief",
          xuid: "2533274800000002",
          status: "paused",
          isLive: false,
        }),
        aFakeTrackerWith({
          trackerId: "fake-tracker-3",
          gamertag: "Cortana",
          xuid: "2533274800000003",
          status: "stopped",
          isLive: false,
        }),
      ],
    }),
    liveTrackerService: new FakeLiveTrackerService(scenario),
  };
}
