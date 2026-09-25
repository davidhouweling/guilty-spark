import { createHaloInfiniteClientProxy } from "@guilty-spark/shared/halo/halo-infinite-client-proxy";
import { installAuthService } from "../../services/auth/install";
import type { AuthService } from "../../services/auth/types";
import {
  installIndividualTrackerSettingsService,
  installIndividualTrackerService,
} from "../../services/individual-tracker/install";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import type { IndividualTrackerService } from "../../services/individual-tracker/types";
import { getMode } from "../../services/mode";
import { aFakeIndividualTrackerSettingsServiceWith } from "../../services/individual-tracker/fakes/settings.fake";

export interface Services {
  readonly authService: AuthService;
  readonly settingsService: IndividualTrackerSettingsService;
  readonly individualTrackerService: IndividualTrackerService;
}

export async function installServices(apiHost: string): Promise<Services> {
  if (getMode() === "FAKE") {
    const [{ FakeAuthService }] = await Promise.all([import("../../services/auth/fakes/auth.fake")]);
    return {
      authService: new FakeAuthService(),
      settingsService: aFakeIndividualTrackerSettingsServiceWith(),
      individualTrackerService: await import("../../services/individual-tracker/fakes/individual-tracker.fake").then(
        ({ aFakeIndividualTrackerServiceWith }) => aFakeIndividualTrackerServiceWith(),
      ),
    };
  }
  const haloInfiniteClient = createHaloInfiniteClientProxy({ proxyBaseUrl: apiHost, credentials: "include" });
  const [authService, settingsService, individualTrackerService] = await Promise.all([
    installAuthService(apiHost),
    installIndividualTrackerSettingsService(apiHost),
    installIndividualTrackerService(apiHost, haloInfiniteClient),
  ]);

  return { authService, settingsService, individualTrackerService };
}
