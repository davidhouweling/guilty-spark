import { installAuthService } from "../../services/auth/install";
import type { AuthService } from "../../services/auth/types";
import { installIndividualTrackerSettingsService } from "../../services/individual-tracker/install";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import { getMode } from "../../services/mode";
import { aFakeIndividualTrackerSettingsServiceWith } from "../../services/individual-tracker/fakes/settings.fake";

export interface Services {
  readonly authService: AuthService;
  readonly settingsService: IndividualTrackerSettingsService;
}

export async function installServices(apiHost: string): Promise<Services> {
  if (getMode() === "FAKE") {
    const [{ FakeAuthService }] = await Promise.all([import("../../services/auth/fakes/auth.fake")]);
    return {
      authService: new FakeAuthService(),
      settingsService: aFakeIndividualTrackerSettingsServiceWith(),
    };
  }
  const [authService, settingsService] = await Promise.all([
    installAuthService(apiHost),
    installIndividualTrackerSettingsService(apiHost),
  ]);

  return { authService, settingsService };
}
