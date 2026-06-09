import type { IndividualTrackerSeriesGroup } from "../individual-tracker/series-group-metadata";

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
