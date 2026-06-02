import { getMode } from "../mode";
import { RealIndividualTrackerService } from "./individual-tracker";
import type { IndividualTrackerService } from "./types";
import { RealIndividualTrackerViewService } from "./view";
import type { IndividualTrackerViewService } from "./view-types";

export async function installIndividualTrackerService(apiHost: string): Promise<IndividualTrackerService> {
  if (getMode() === "FAKE") {
    const { installFakeServices } = await import("../fakes/install.fake");
    const { individualTrackerService } = await installFakeServices();
    return individualTrackerService;
  }

  return new RealIndividualTrackerService({ apiHost });
}

export async function installIndividualTrackerViewService(apiHost: string): Promise<IndividualTrackerViewService> {
  if (getMode() === "FAKE") {
    const { aFakeIndividualTrackerViewServiceWith } = await import("./fakes/view.fake");
    return aFakeIndividualTrackerViewServiceWith();
  }

  return new RealIndividualTrackerViewService({ apiHost });
}
