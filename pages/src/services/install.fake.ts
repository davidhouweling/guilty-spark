import type { Services } from "./types";

export async function installFakeServices(): Promise<Services> {
  const [
    { FakeLiveTrackerService },
    { createSampleScenario, createSampleIndividualScenario },
    { FakeTrackerInitiationService },
  ] = await Promise.all([
    import("./live-tracker/fakes/live-tracker.fake"),
    import("./live-tracker/fakes/scenario"),
    import("./tracker-initiation/fakes/tracker-initiation.fake"),
  ]);

  // Check URL params to determine which scenario to use
  const params = new URLSearchParams(window.location.search);
  const trackerMode = params.get("fake-tracker-mode") ?? "team";

  const scenario = trackerMode === "individual" ? createSampleIndividualScenario() : createSampleScenario();

  return {
    liveTrackerService: new FakeLiveTrackerService(scenario),
    trackerInitiationService: new FakeTrackerInitiationService(),
  };
}
