import type { LiveTrackerStatus, PlayerAssociationData } from "@guilty-spark/shared/live-tracker/types";
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

export type LiveTrackerStateRenderModel = LiveTrackerNeatQueueStateRenderModel;

/**
 * Render model for NeatQueue tracker (Discord guild queue).
 */
export interface LiveTrackerNeatQueueStateRenderModel {
  readonly type: "neatqueue";
  readonly guildName: string;
  readonly guildId: string;
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

export interface LiveTrackerViewModel {
  readonly title: string;
  readonly subtitle: string;
  readonly iconUrl: string | null;
  readonly statusText: string;
  readonly statusClassName: string;
  readonly state: LiveTrackerStateRenderModel | null;
}
