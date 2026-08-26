import type { ActiveSeriesSummary } from "@guilty-spark/shared/contracts/neatqueue/active-series";
import type { SeriesInitialData } from "../../individual-tracker/manual-series-dialog/manual-series-dialog-store";

export interface LiveNeatQueueSeriesDialogState {
  readonly trackerId: string;
  readonly trackerLabel: string;
  readonly initialData: SeriesInitialData;
  readonly goLiveOnSubmit: boolean;
}

export interface LiveNeatQueueSeriesSnapshot {
  readonly series: readonly ActiveSeriesSummary[];
  readonly loading: boolean;
  readonly busySourceKey: string | null;
  readonly errorMessage: string | null;
  readonly dialogState: LiveNeatQueueSeriesDialogState | null;
}

export interface SeriesCard {
  readonly guildId: string;
  readonly queueNumber: number;
  readonly title: string;
  readonly subtitle: string;
  readonly guildIconUrl: string | null;
  readonly teamNames: readonly string[];
  readonly busy: boolean;
}
