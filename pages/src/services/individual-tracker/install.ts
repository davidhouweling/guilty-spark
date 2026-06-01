import { getMode } from "../mode";
import { RealIndividualTrackerService } from "./individual-tracker";
import type { IndividualTrackerService } from "./types";

export async function installIndividualTrackerService(apiHost: string): Promise<IndividualTrackerService> {
  if (getMode() === "FAKE") {
    const { installFakeServices } = await import("../fakes/install.fake");
    const { individualTrackerService } = await installFakeServices();
    return individualTrackerService;
  }

  return new RealIndividualTrackerService({ apiHost });
}
