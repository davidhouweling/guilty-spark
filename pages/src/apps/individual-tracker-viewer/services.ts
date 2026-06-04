import type { HaloInfiniteClient } from "halo-infinite-api";
import { createHaloInfiniteClientProxy } from "@guilty-spark/shared/halo/halo-infinite-client-proxy";
import { installAuthService } from "../../services/auth/install";
import type { AuthService } from "../../services/auth/types";
import { installIndividualTrackerViewService } from "../../services/individual-tracker/install";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";

export interface Services {
  readonly authService: AuthService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly haloClient: HaloInfiniteClient;
}

export async function installServices(apiHost: string): Promise<Services> {
  const [authService, individualTrackerViewService] = await Promise.all([
    installAuthService(apiHost),
    installIndividualTrackerViewService(apiHost),
  ]);
  const haloClient = createHaloInfiniteClientProxy({ proxyBaseUrl: apiHost, credentials: "include" });
  return { authService, individualTrackerViewService, haloClient };
}
