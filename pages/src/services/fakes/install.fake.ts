import type { AuthService } from "../auth/types";
import type { IndividualTrackerService } from "../individual-tracker/types";
import type { LiveTrackerService } from "../live-tracker/types";

interface FakeServices {
  readonly authService: AuthService;
  readonly individualTrackerService: IndividualTrackerService;
  readonly liveTrackerService: LiveTrackerService;
}

export async function installFakeServices(): Promise<FakeServices> {
  const [{ FakeAuthService }, { FakeIndividualTrackerService }, { FakeLiveTrackerService }, { createSampleScenario }] =
    await Promise.all([
      import("../auth/fakes/auth.fake"),
      import("../individual-tracker/fakes/individual-tracker.fake"),
      import("../live-tracker/fakes/live-tracker.fake"),
      import("../live-tracker/fakes/scenario"),
    ]);

  const scenario = createSampleScenario();

  return {
    authService: new FakeAuthService(),
    individualTrackerService: new FakeIndividualTrackerService(),
    liveTrackerService: new FakeLiveTrackerService(scenario),
  };
}
