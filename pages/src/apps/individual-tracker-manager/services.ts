import { installAuthService } from "../../services/auth/install";
import type { AuthService } from "../../services/auth/types";
import { installIndividualTrackerService } from "../../services/individual-tracker/install";
import type { IndividualTrackerService } from "../../services/individual-tracker/types";

export interface Services {
  readonly authService: AuthService;
  readonly individualTrackerService: IndividualTrackerService;
}

export async function installServices(apiHost: string): Promise<Services> {
  const [authService, individualTrackerService] = await Promise.all([
    installAuthService(apiHost),
    installIndividualTrackerService(apiHost),
  ]);

  return { authService, individualTrackerService };
}
