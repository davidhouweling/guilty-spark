import type { LiveTrackerService } from "./live-tracker/types";

export interface Services {
  readonly liveTrackerService: LiveTrackerService;
}

export type PagesMode = "REAL" | "FAKE";

function getMode(): PagesMode {
  const mode = import.meta.env.MODE;
  return mode === "FAKE" ? "FAKE" : "REAL";
}

export async function installServices(apiHost: string): Promise<Services> {
  const mode = getMode();

  if (mode === "FAKE") {
    const [{ FakeLiveTrackerService }, { createSampleScenario }] = await Promise.all([
      import("./live-tracker/fakes/live-tracker.fake"),
      import("./live-tracker/fakes/scenario"),
    ]);

    return {
      liveTrackerService: new FakeLiveTrackerService(createSampleScenario()),
    };
  }

  const { RealLiveTrackerService } = await import("./live-tracker/live-tracker");

  return {
    liveTrackerService: new RealLiveTrackerService({ apiHost }),
  };
}
