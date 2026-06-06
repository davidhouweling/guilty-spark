import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { ManagerModel } from "./manager-model";

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
  readonly settingsSaving: boolean;
  readonly settingsError: string | null;
  readonly liveXuid: string | null;
}
