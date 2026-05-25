import { RealLiveTrackerService } from "../../services/live-tracker/live-tracker";
import type { LiveTrackerService } from "../../services/live-tracker/types";
import { getMode } from "../../services/mode";

export interface Services {
  readonly liveTrackerService: LiveTrackerService;
}

export async function installServices(apiHost: string): Promise<Services> {
  const mode = getMode();

  if (mode === "FAKE") {
    return import("../../services/fakes/install.fake").then(async ({ installFakeServices }) => {
      const { liveTrackerService } = await installFakeServices();
      return { liveTrackerService };
    });
  }

  return {
    liveTrackerService: new RealLiveTrackerService({ apiHost }),
  };
}
