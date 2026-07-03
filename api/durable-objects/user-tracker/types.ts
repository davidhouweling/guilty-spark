import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import type { UserTrackerViewState } from "@guilty-spark/shared/contracts/durable-objects/user-tracker/management";
import type { UserTrackerState } from "@guilty-spark/shared/contracts/durable-objects/user-tracker/lifecycle";

export interface UserTrackerInternalState {
  state: UserTrackerState | null;
  viewState: UserTrackerViewState | null;
}

export const emptyTrackerDirectory: TrackerDirectory = {
  trackers: [],
  liveTrackerId: null,
};
