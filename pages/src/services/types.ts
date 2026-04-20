import type { AuthService } from "./auth/types";
import type { LiveTrackerService } from "./live-tracker/types";
import type { IndividualTrackerService } from "./individual-tracker/types";

export interface Services {
  readonly authService: AuthService;
  readonly liveTrackerService: LiveTrackerService;
  readonly individualTrackerService: IndividualTrackerService;
}
