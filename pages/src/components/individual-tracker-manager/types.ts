import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualTrackerSeriesGroup } from "../individual-tracker/series-group-metadata";
import type { ManagerModel } from "./manager-model";

export interface GameSelectionDialogState {
  readonly trackerId: string;
  readonly trackerLabel: string;
  readonly xuid: string;
  readonly initialSelectedMatchIds: readonly string[];
  readonly initialGroupings: readonly (readonly string[])[];
  readonly initialSeriesGroups: readonly IndividualTrackerSeriesGroup[];
}

export interface ManualSeriesDialogState {
  readonly trackerId: string;
  readonly trackerLabel: string;
}

export interface IndividualTrackerManagerViewModel {
  readonly model: ManagerModel;
  readonly profileName: string;
  readonly isAddDialogOpen: boolean;
  readonly gamertagInput: string;
  readonly searchStartTime: string;
  readonly idleTimeoutHours: string;
  readonly addPending: boolean;
  readonly pendingTrackerId: string | null;
  readonly addDisabled: boolean;
  readonly settings: StreamerViewSettings;
  readonly liveGamertag: string | null;
}
