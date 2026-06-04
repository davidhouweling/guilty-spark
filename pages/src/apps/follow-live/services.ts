import type { HaloInfiniteClient } from "halo-infinite-api";
import { createHaloInfiniteClientProxy } from "@guilty-spark/shared/halo/halo-infinite-client-proxy";
import { installFollowLiveService } from "../../services/follow/install";
import type { FollowLiveService } from "../../services/follow/follow-types";
import { installIndividualTrackerViewService } from "../../services/individual-tracker/install";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";

export interface Services {
  readonly followLiveService: FollowLiveService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly haloClient: HaloInfiniteClient;
}

export async function installServices(apiHost: string): Promise<Services> {
  const [followLiveService, individualTrackerViewService] = await Promise.all([
    installFollowLiveService(apiHost),
    installIndividualTrackerViewService(apiHost),
  ]);
  const haloClient = createHaloInfiniteClientProxy({ proxyBaseUrl: apiHost });
  return { followLiveService, individualTrackerViewService, haloClient };
}
