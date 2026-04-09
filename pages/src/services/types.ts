import type { AuthService } from "./auth/types";
import type { LiveTrackerService } from "./live-tracker/types";

export interface Services {
  readonly authService: AuthService;
  readonly liveTrackerService: LiveTrackerService;
}
