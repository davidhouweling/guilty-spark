import type { LiveTrackerService } from "./live-tracker/types";
import type { TrackerInitiationService } from "./tracker-initiation/types";

export interface Services {
  readonly liveTrackerService: LiveTrackerService;
  readonly trackerInitiationService: TrackerInitiationService;
}
