import type { TrackerStatus } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import type { TrackerViewConnectionStatus } from "../../../services/individual-tracker/view-types";

export type ViewerTabOutcome = "win" | "loss" | "tie" | "dnf" | "unknown";

export interface ViewerMatchTab {
  readonly matchId: string;
  readonly mapName: string;
  readonly gameVariantCategory: number;
  readonly outcome: ViewerTabOutcome;
  readonly score: string;
  readonly colorHex: string | undefined;
  readonly startTime: string;
  readonly endTime: string;
}

export interface ViewerSeriesTab {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly score: string;
  readonly matches: readonly ViewerMatchTab[];
  readonly colorHex: string | undefined;
}

export type ViewerTimelineItem =
  | { readonly type: "match"; readonly match: ViewerMatchTab }
  | { readonly type: "series"; readonly series: ViewerSeriesTab };

export interface ViewerAccumulatedStats {
  readonly total: number;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
}

export interface IndividualTrackerViewerRenderModel {
  readonly trackerId: string;
  readonly gamertag: string;
  readonly status: TrackerStatus;
  readonly isLive: boolean;
  readonly lastUpdateTime: string;
  readonly timeline: readonly ViewerTimelineItem[];
  readonly accumulated: ViewerAccumulatedStats;
}

export interface IndividualTrackerViewerViewModel {
  readonly renderModel: IndividualTrackerViewerRenderModel | null;
  readonly connectionStatus: TrackerViewConnectionStatus;
}
