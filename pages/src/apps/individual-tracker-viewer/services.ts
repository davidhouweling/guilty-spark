import { installIndividualTrackerViewService } from "../../services/individual-tracker/install";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";

export interface Services {
  readonly individualTrackerViewService: IndividualTrackerViewService;
}

export async function installServices(apiHost: string): Promise<Services> {
  const individualTrackerViewService = await installIndividualTrackerViewService(apiHost);
  return { individualTrackerViewService };
}
