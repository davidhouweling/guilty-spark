import type { LiveTrackerStatus } from "@guilty-spark/contracts/live-tracker/types";
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

export interface LiveTrackerStateRenderModel {
  readonly guildName: string;
  readonly queueNumber: number;
  readonly status: LiveTrackerStatus;
  readonly lastUpdateTime: string;
  readonly teams: readonly LiveTrackerTeamRenderModel[];
  readonly matches: readonly LiveTrackerMatchRenderModel[];
  readonly substitutions: readonly LiveTrackerSubstitutionRenderModel[];
  readonly seriesScore: string;
  readonly medalMetadata: Record<number, { name: string; sortingWeight: number }>;
}

export interface LiveTrackerViewModel {
  readonly guildNameText: string;
  readonly queueNumberText: string;
  readonly statusText: string;
  readonly statusClassName: string;
  readonly state: LiveTrackerStateRenderModel | null;
}
