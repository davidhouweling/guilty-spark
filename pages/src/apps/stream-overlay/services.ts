import { installAuthService } from "../../services/auth/install";
import type { AuthService } from "../../services/auth/types";
import { installIndividualTrackerSettingsService } from "../../services/individual-tracker/install";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";

export interface Services {
  readonly authService: AuthService;
  readonly settingsService: IndividualTrackerSettingsService;
}

export async function installServices(apiHost: string): Promise<Services> {
  const [authService, settingsService] = await Promise.all([
    installAuthService(apiHost),
    installIndividualTrackerSettingsService(apiHost),
  ]);

  return { authService, settingsService };
}
