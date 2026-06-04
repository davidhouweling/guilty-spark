import type { HaloInfiniteClient } from "halo-infinite-api";
import { createHaloInfiniteClientProxy } from "@guilty-spark/shared/halo/halo-infinite-client-proxy";
import { installFollowLiveService } from "../../services/follow/install";
import type { FollowLiveService } from "../../services/follow/follow-types";
import { installIndividualTrackerViewService } from "../../services/individual-tracker/install";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";
import { getMode } from "../../services/mode";

export interface Services {
  readonly followLiveService: FollowLiveService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly haloClient: HaloInfiniteClient;
}

export async function installServices(apiHost: string): Promise<Services> {
  if (getMode() === "FAKE") {
    const [{ aFakeFollowLiveServiceWith }, { aFakeIndividualTrackerViewServiceWith }, { aFakeHaloClientWith }] =
      await Promise.all([
        import("../../services/follow/fakes/follow.fake"),
        import("../../services/individual-tracker/fakes/view.fake"),
        import("../../services/fakes/halo-client.fake"),
      ]);
    return {
      followLiveService: aFakeFollowLiveServiceWith(),
      individualTrackerViewService: aFakeIndividualTrackerViewServiceWith(),
      haloClient: aFakeHaloClientWith(),
    };
  }

  const [followLiveService, individualTrackerViewService] = await Promise.all([
    installFollowLiveService(apiHost),
    installIndividualTrackerViewService(apiHost),
  ]);
  const haloClient = createHaloInfiniteClientProxy({ proxyBaseUrl: apiHost });
  return { followLiveService, individualTrackerViewService, haloClient };
}
