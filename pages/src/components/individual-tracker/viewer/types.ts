import type { TopBarStatItem } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { TrackerStatus } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { TrackerViewConnectionStatus } from "../../../services/individual-tracker/view-types";
import type { MatchStatsState } from "./viewer-store";

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
  readonly topBarStats: readonly TopBarStatItem[] | undefined;
}

export interface IndividualTrackerViewerViewModel {
  readonly renderModel: IndividualTrackerViewerRenderModel | null;
  readonly connectionStatus: TrackerViewConnectionStatus;
  readonly selectedMatchId: string | null;
  readonly matchStatsState: MatchStatsState | null;
  readonly streamerSettings: StreamerViewSettings | undefined;
}
