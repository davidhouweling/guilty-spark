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
  readonly duration: string;
  readonly gameScore: string;
  readonly endTime: string;
}

export interface LiveTrackerStateRenderModel {
  readonly userId: string;
  readonly queueNumber: number;
  readonly status: string;
  readonly lastUpdateTime: string;
  readonly teams: readonly LiveTrackerTeamRenderModel[];
  readonly matches: readonly LiveTrackerMatchRenderModel[];
}

export interface TrackerWebSocketDemoViewModel {
  readonly guildIdText: string;
  readonly queueNumberText: string;
  readonly statusText: string;
  readonly statusClassName: string;
  readonly rawMessageText: string;
  readonly state: LiveTrackerStateRenderModel | null;
  readonly isStopped: boolean;
}
