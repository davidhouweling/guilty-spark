import type { Services } from "./types";

export async function installFakeServices(): Promise<Services> {
  const [{ FakeLiveTrackerService }, { createSampleScenario }] = await Promise.all([
    import("./live-tracker/fakes/live-tracker.fake"),
    import("./live-tracker/fakes/scenario"),
  ]);

  const scenario = createSampleScenario();

  return {
    liveTrackerService: new FakeLiveTrackerService(scenario),
  };
}
