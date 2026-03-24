import { RealLiveTrackerService } from "./live-tracker/live-tracker";
import { RealTrackerInitiationService } from "./tracker-initiation/tracker-initiation";
import type { Services } from "./types";

export type PagesMode = "REAL" | "FAKE";

function getMode(): PagesMode {
  const mode = import.meta.env.MODE;
  const normalized = mode.toLowerCase();
  return normalized === "fake" || normalized === "test" ? "FAKE" : "REAL";
}

export async function installServices(apiHost: string): Promise<Services> {
  const mode = getMode();

  if (mode === "FAKE") {
    return import("./install.fake").then(async ({ installFakeServices }) => installFakeServices());
  }

  return {
    liveTrackerService: new RealLiveTrackerService({ apiHost }),
    trackerInitiationService: new RealTrackerInitiationService({ apiHost }),
  };
}
