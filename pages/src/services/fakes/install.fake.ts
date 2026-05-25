import type { LiveTrackerService } from "../live-tracker/types";

interface FakeServices {
  readonly liveTrackerService: LiveTrackerService;
}

export async function installFakeServices(): Promise<FakeServices> {
  const [{ FakeLiveTrackerService }, { createSampleScenario }] = await Promise.all([
    import("../live-tracker/fakes/live-tracker.fake"),
    import("../live-tracker/fakes/scenario"),
  ]);

  const scenario = createSampleScenario();

  return {
    liveTrackerService: new FakeLiveTrackerService(scenario),
  };
}
