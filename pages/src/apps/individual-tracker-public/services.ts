import type { HaloInfiniteClient } from "halo-infinite-api";
import { createHaloInfiniteClientProxy } from "@guilty-spark/shared/halo/halo-infinite-client-proxy";
import { installIndividualTrackerViewService } from "../../services/individual-tracker/install";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import { getMode } from "../../services/mode";

export interface Services {
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly haloClient: HaloInfiniteClient;
}

export async function installServices(apiHost: string): Promise<Services> {
  if (getMode() === "FAKE") {
    const [{ aFakeIndividualTrackerViewServiceWith }, { aFakeHaloClientWith }] = await Promise.all([
      import("../../services/individual-tracker/fakes/view.fake"),
      import("../../services/fakes/halo-client.fake"),
    ]);
    return {
      individualTrackerViewService: aFakeIndividualTrackerViewServiceWith(),
      haloClient: aFakeHaloClientWith(),
    };
  }

  const individualTrackerViewService = await installIndividualTrackerViewService(apiHost);
  const haloClient = createHaloInfiniteClientProxy({ proxyBaseUrl: apiHost });
  return { individualTrackerViewService, haloClient };
}
