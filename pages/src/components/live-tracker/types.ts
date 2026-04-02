import type { LiveTrackerStatus, PlayerAssociationData } from "@guilty-spark/contracts/live-tracker/types";
import type { MatchStats } from "halo-infinite-api";

export interface LiveTrackerPlayerRenderModel {
  readonly id: string;
  readonly displayName: string;
}

export interface LiveTrackerTeamRenderModel {
  readonly name: string;
  readonly players: readonly LiveTrackerPlayerRenderModel[];
}

export interface LiveTrackerMatchRenderModel {
  readonly matchId: string;
  readonly gameTypeAndMap: string;
  readonly gameType: string;
  readonly gameMap: string;
  readonly gameMapThumbnailUrl: string;
  readonly duration: string;
  readonly gameScore: string;
  readonly gameSubScore: string | null;
  readonly startTime: string;
  readonly endTime: string;
  readonly rawMatchStats: MatchStats | null;
  readonly playerXuidToGametag: Record<string, string>;
}

export interface LiveTrackerSubstitutionRenderModel {
  readonly playerOutId: string;
  readonly playerOutDisplayName: string;
  readonly playerInId: string;
  readonly playerInDisplayName: string;
  readonly teamName: string;
  readonly timestamp: string;
}

export interface LiveTrackerSeriesDataRenderModel {
  readonly seriesId: {
    readonly guildId: string;
    readonly queueNumber: number;
  };
  readonly teams: readonly {
    readonly name: string;
    readonly playerIds: readonly string[];
  }[];
  readonly seriesScore: string;
  readonly matchIds: readonly string[];
  readonly startTime: string;
  readonly lastUpdateTime: string;
}

// ============================================================================
// INDIVIDUAL GROUP RENDER MODELS (discriminated union)
// ============================================================================

export type LiveTrackerGroupRenderModel =
  | LiveTrackerNeatQueueSeriesGroupRenderModel
  | LiveTrackerManualMatchGroupRenderModel
  | LiveTrackerSingleMatchGroupRenderModel;

export interface LiveTrackerNeatQueueSeriesGroupRenderModel {
  readonly type: "neatqueue-series";
  readonly groupId: string;
  readonly seriesId: {
    readonly guildId: string;
    readonly queueNumber: number;
  };
  readonly teams: readonly LiveTrackerTeamRenderModel[];
  readonly matches: readonly LiveTrackerMatchRenderModel[];
  readonly substitutions: readonly LiveTrackerSubstitutionRenderModel[];
  readonly seriesScore: string;
  readonly seriesData?: LiveTrackerSeriesDataRenderModel;
}

export interface LiveTrackerManualMatchGroupRenderModel {
  readonly type: "grouped-matches";
  readonly groupId: string;
  readonly label: string;
  readonly seriesScore: string;
  readonly matches: readonly LiveTrackerMatchRenderModel[];
}

export interface LiveTrackerSingleMatchGroupRenderModel {
  readonly type: "single-match";
  readonly groupId: string;
  readonly match: LiveTrackerMatchRenderModel;
}

// ============================================================================
// STATE RENDER MODEL (discriminated union)
// ============================================================================

export type LiveTrackerStateRenderModel = LiveTrackerNeatQueueStateRenderModel | LiveTrackerIndividualStateRenderModel;

/**
 * Render model for NeatQueue tracker (Discord guild queue).
 */
export interface LiveTrackerNeatQueueStateRenderModel {
  readonly type: "neatqueue";
  readonly guildName: string;
  readonly guildIcon: string | null;
  readonly queueNumber: number;
  readonly status: LiveTrackerStatus;
  readonly lastUpdateTime: string;
  readonly teams: readonly LiveTrackerTeamRenderModel[];
  readonly matches: readonly LiveTrackerMatchRenderModel[];
  readonly substitutions: readonly LiveTrackerSubstitutionRenderModel[];
  readonly seriesScore: string;
  readonly medalMetadata: Record<number, { name: string; sortingWeight: number }>;
  readonly playersAssociationData: Record<string, PlayerAssociationData> | null;
  readonly seriesData?: LiveTrackerSeriesDataRenderModel;
}

/**
 * Render model for Individual tracker (single player).
 */
export interface LiveTrackerIndividualStateRenderModel {
  readonly type: "individual";
  readonly gamertag: string;
  readonly xuid: string;
  readonly status: LiveTrackerStatus;
  readonly lastUpdateTime: string;
  readonly groups: readonly LiveTrackerGroupRenderModel[];
  readonly medalMetadata: Record<number, { name: string; sortingWeight: number }>;
  readonly playersAssociationData: Record<string, PlayerAssociationData> | null;
}

export interface LiveTrackerViewModel {
  readonly title: string;
  readonly subTitle: string;
  readonly iconUrl: string | null;
  readonly statusText: string;
  readonly statusClassName: string;
  readonly state: LiveTrackerStateRenderModel | null;
}
