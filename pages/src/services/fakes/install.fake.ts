import type { AuthService } from "../auth/types";
import type { LiveTrackerService } from "../live-tracker/types";

interface FakeServices {
  readonly authService: AuthService;
  readonly liveTrackerService: LiveTrackerService;
}

export async function installFakeServices(): Promise<FakeServices> {
  const [{ FakeAuthService }, { FakeLiveTrackerService }, { createSampleScenario }] = await Promise.all([
    import("../auth/fakes/auth.fake"),
    import("../live-tracker/fakes/live-tracker.fake"),
    import("../live-tracker/fakes/scenario"),
  ]);

  const scenario = createSampleScenario();

  return {
    authService: new FakeAuthService(),
    liveTrackerService: new FakeLiveTrackerService(scenario),
  };
}
