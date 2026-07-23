import type { IndividualTrackerSeriesGroup } from "../individual-tracker/series-group-metadata";
import type { SeriesInitialData } from "../individual-tracker/manual-series-dialog/manual-series-dialog-store";

export interface MatchSelectionDialogState {
  readonly trackerId: string;
  readonly trackerLabel: string;
  readonly xuid: string;
  readonly initialSelectedMatchIds: readonly string[];
  readonly initialGroupings: readonly (readonly string[])[];
  readonly initialSeriesGroups: readonly IndividualTrackerSeriesGroup[];
  readonly searchStartTime?: string;
  readonly hasActiveSeriesWarning?: boolean;
}

export interface ManualSeriesDialogState {
  readonly trackerId: string;
  readonly trackerLabel: string;
  readonly initialData?: SeriesInitialData;
}
