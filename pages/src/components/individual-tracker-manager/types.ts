import type { ManagerModel } from "./manager-model";

export interface IndividualTrackerManagerViewModel {
  readonly model: ManagerModel;
  readonly profileName: string;
  readonly gamertagInput: string;
  readonly addPending: boolean;
  readonly pendingTrackerId: string | null;
  readonly addDisabled: boolean;
}
