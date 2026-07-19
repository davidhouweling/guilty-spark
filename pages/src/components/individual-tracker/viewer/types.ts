import type { PreSeriesPlayerInfo, StatsHighlightItem } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { TrackerStatus } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import type { PlayerAssociationData } from "@guilty-spark/shared/live-tracker/types";
import type { NormalizedMatchOutcome } from "@guilty-spark/shared/halo/match-enrichment";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { ComponentLoaderStatus } from "../../component-loader/component-loader";
import type { TrackerViewConnectionStatus } from "../../../services/individual-tracker/view-types";
import type { MatchStatsData } from "../../../controllers/stats/types";
import type { KillMatrixCrossTeamData, KillMatrixPivotData } from "../../../controllers/stats/kill-matrix/types";
import type { TeamColor } from "../../team-colors/team-colors";
import type { ScoreProgressionViewData } from "../../stats/score-progression/types";
import type { SeriesStatsViewModel } from "../../series-stats/types";

export interface ViewerMatchTab {
  readonly matchId: string;
  readonly mapName: string;
  readonly mapBackgroundUrl: string;
  readonly gameVariantCategory: number;
  readonly isMatchmaking: boolean;
  readonly gameModeName: string;
  readonly duration: string;
  readonly outcome: NormalizedMatchOutcome;
  readonly score: string;
  readonly killsDeathsAssistsKda: string;
  readonly damageDealtTakenRatio: string;
  readonly colorHex: string | undefined;
  readonly startTime: string;
  readonly endTime: string;
}

export interface ViewerSeriesTab {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly guildIconUrl?: string | null;
  readonly isActive: boolean;
  readonly teams: readonly ViewerSeriesTeam[];
  readonly preSeriesTableData?: ViewerPreSeriesTableData;
  readonly matchBackgroundUrls: readonly string[];
  readonly score: string;
  readonly duration: string;
  readonly killsDeathsAssistsKda: string;
  readonly damageDealtTakenRatio: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly matches: readonly ViewerMatchTab[];
  readonly colorHex: string | undefined;
}

export interface ViewerSeriesTeamPlayer {
  readonly discordId?: string | null;
  readonly discordName: string | null;
  readonly gamertag: string | null;
  readonly xboxId?: string | null;
  readonly currentRank?: number | null;
  readonly currentRankTier?: string | null;
  readonly currentRankSubTier?: number | null;
  readonly currentRankMeasurementMatchesRemaining?: number | null;
  readonly currentRankInitialMeasurementMatches?: number | null;
  readonly allTimePeakRank?: number | null;
  readonly esra?: number | null;
  readonly lastRankedGamePlayed?: string | null;
}

export interface ViewerSeriesTeam {
  readonly id: number;
  readonly name: string;
  readonly players: readonly ViewerSeriesTeamPlayer[];
}

export interface ViewerPreSeriesTableTeam {
  readonly name: string;
  readonly players: readonly { id: string; displayName: string }[];
}

export interface ViewerPreSeriesTableData {
  readonly teams: readonly ViewerPreSeriesTableTeam[];
  readonly playersAssociationData: Record<string, PlayerAssociationData>;
}

export interface ViewerActiveSeriesContext {
  readonly title: string;
  readonly subtitle: string | null;
  readonly guildIconUrl?: string | null;
  readonly startedAt?: string;
  readonly teams: readonly ViewerSeriesTeam[];
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
  readonly hasActiveSeries: boolean;
  readonly activeSeriesContext: ViewerActiveSeriesContext | undefined;
  readonly lastUpdateTime: string;
  readonly timeline: readonly ViewerTimelineItem[];
  readonly accumulated: ViewerAccumulatedStats;
  readonly statsHighlights: readonly StatsHighlightItem[] | undefined;
  readonly preSeriesPlayerInfo: PreSeriesPlayerInfo | undefined;
  readonly teamColors: readonly TeamColor[];
}

export type MatchDetailsState =
  | { readonly status: "loading" }
  | {
      readonly status: "loaded";
      readonly matchId: string;
      readonly gameVariantCategory: number;
      readonly gameMapThumbnailUrl: string;
      readonly duration: string;
      readonly startTime: string;
      readonly endTime: string;
      readonly data: MatchStatsData[];
      readonly killMatrixPivotData: KillMatrixPivotData;
      readonly transposedKillMatrixPivotData: KillMatrixPivotData;
      readonly crossTeamKillMatrixData: KillMatrixCrossTeamData | null;
      readonly swappedCrossTeamKillMatrixData: KillMatrixCrossTeamData | null;
      readonly killMatrixStatus: ComponentLoaderStatus;
      readonly scoreProgressionViewData: ScoreProgressionViewData | null;
    }
  | { readonly status: "error"; readonly message: string };

export type SeriesDetailsState =
  | { readonly status: "loading" }
  | {
      readonly status: "loaded";
      readonly seriesId: string;
      readonly viewModel: SeriesStatsViewModel;
    }
  | { readonly status: "error"; readonly message: string };

export type ViewerEntryState =
  | { readonly kind: "match"; readonly state: MatchDetailsState }
  | { readonly kind: "series"; readonly state: SeriesDetailsState };

export interface IndividualTrackerViewerViewModel {
  readonly renderModel: IndividualTrackerViewerRenderModel | null;
  readonly connectionStatus: TrackerViewConnectionStatus;
  readonly refreshPending: boolean;
  readonly expandedEntryKeys: ReadonlySet<string>;
  readonly entryStates: ReadonlyMap<string, ViewerEntryState>;
  readonly streamerSettings: StreamerViewSettings | undefined;
}
