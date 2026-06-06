import type { HaloInfiniteClient } from "halo-infinite-api";
import { createHaloInfiniteClientProxy } from "@guilty-spark/shared/halo/halo-infinite-client-proxy";
import { installAuthService } from "../../services/auth/install";
import type { AuthService } from "../../services/auth/types";
import {
  installIndividualTrackerService,
  installIndividualTrackerViewService,
} from "../../services/individual-tracker/install";
import type { IndividualTrackerService } from "../../services/individual-tracker/types";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";

export interface Services {
  readonly authService: AuthService;
  readonly individualTrackerService: IndividualTrackerService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly haloClient: HaloInfiniteClient;
}

export async function installServices(apiHost: string): Promise<Services> {
  const haloClient = createHaloInfiniteClientProxy({ proxyBaseUrl: apiHost, credentials: "include" });
  const [authService, individualTrackerService, individualTrackerViewService] = await Promise.all([
    installAuthService(apiHost),
    installIndividualTrackerService(apiHost, haloClient),
    installIndividualTrackerViewService(apiHost),
  ]);
  return { authService, individualTrackerService, individualTrackerViewService, haloClient };
}
