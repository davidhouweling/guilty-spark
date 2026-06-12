import { createHaloInfiniteClientProxy } from "@guilty-spark/shared/halo/halo-infinite-client-proxy";
import { installAuthService } from "../../services/auth/install";
import type { AuthService } from "../../services/auth/types";
import {
  installIndividualTrackerService,
  installIndividualTrackerSettingsService,
  installIndividualTrackerViewService,
} from "../../services/individual-tracker/install";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import type { IndividualTrackerService } from "../../services/individual-tracker/types";
import type { IndividualTrackerViewService } from "../../services/individual-tracker/view-types";

export interface Services {
  readonly authService: AuthService;
  readonly individualTrackerService: IndividualTrackerService;
  readonly settingsService: IndividualTrackerSettingsService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
}

export async function installServices(apiHost: string): Promise<Services> {
  const haloInfiniteClient = createHaloInfiniteClientProxy({ proxyBaseUrl: apiHost, credentials: "include" });

  const [authService, individualTrackerService, settingsService, individualTrackerViewService] = await Promise.all([
    installAuthService(apiHost),
    installIndividualTrackerService(apiHost, haloInfiniteClient),
    installIndividualTrackerSettingsService(apiHost),
    installIndividualTrackerViewService(apiHost),
  ]);

  return { authService, individualTrackerService, settingsService, individualTrackerViewService };
}
