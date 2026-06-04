import { installAuthService } from "../../services/auth/install";
import type { AuthService } from "../../services/auth/types";
import {
  installIndividualTrackerService,
  installIndividualTrackerSettingsService,
} from "../../services/individual-tracker/install";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import type { IndividualTrackerService } from "../../services/individual-tracker/types";

export interface Services {
  readonly authService: AuthService;
  readonly individualTrackerService: IndividualTrackerService;
  readonly settingsService: IndividualTrackerSettingsService;
}

export async function installServices(apiHost: string): Promise<Services> {
  const [authService, individualTrackerService, settingsService] = await Promise.all([
    installAuthService(apiHost),
    installIndividualTrackerService(apiHost),
    installIndividualTrackerSettingsService(apiHost),
  ]);

  return { authService, individualTrackerService, settingsService };
}
