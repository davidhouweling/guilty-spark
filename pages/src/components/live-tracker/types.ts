import type { LiveTrackerStatus } from "@guilty-spark/contracts/live-tracker/types";

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
}

export interface LiveTrackerStateRenderModel {
  readonly guildName: string;
  readonly queueNumber: number;
  readonly status: LiveTrackerStatus;
  readonly lastUpdateTime: string;
  readonly teams: readonly LiveTrackerTeamRenderModel[];
  readonly matches: readonly LiveTrackerMatchRenderModel[];
}

export interface LiveTrackerViewModel {
  readonly guildNameText: string;
  readonly queueNumberText: string;
  readonly statusText: string;
  readonly statusClassName: string;
  readonly rawMessageText: string;
  readonly state: LiveTrackerStateRenderModel | null;
  readonly isStopped: boolean;
}
