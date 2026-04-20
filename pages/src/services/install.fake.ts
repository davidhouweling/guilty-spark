import type { Services } from "./types";

export async function installFakeServices(): Promise<Services> {
  const [
    { aFakeAuthServiceWith },
    { FakeLiveTrackerService },
    { createSampleScenario },
    { FakeIndividualTrackerService },
  ] = await Promise.all([
    import("./auth/fakes/auth.fake"),
    import("./live-tracker/fakes/live-tracker.fake"),
    import("./live-tracker/fakes/scenario"),
    import("./individual-tracker/fakes/individual-tracker.fake"),
  ]);

  const scenario = createSampleScenario();

  return {
    authService: aFakeAuthServiceWith(),
    liveTrackerService: new FakeLiveTrackerService(scenario),
    individualTrackerService: new FakeIndividualTrackerService(),
  };
}
