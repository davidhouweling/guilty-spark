import { RealLiveTrackerService } from "./live-tracker/live-tracker";
import type { Services } from "./types";

export type PagesMode = "REAL" | "FAKE";

function getMode(): PagesMode {
  const mode = import.meta.env.MODE;
  return mode.toLowerCase() === "fake" ? "FAKE" : "REAL";
}

export async function installServices(apiHost: string): Promise<Services> {
  const mode = getMode();

  if (mode === "FAKE") {
    return import("./install.fake").then(async (module) => module.installFakeServices());
  }

  return {
    liveTrackerService: new RealLiveTrackerService({ apiHost }),
  };
}
