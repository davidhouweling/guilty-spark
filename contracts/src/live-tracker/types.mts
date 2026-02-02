export interface LiveTrackerIdentity {
  readonly guildId: string;
  readonly queueNumber: string;
}

export type LiveTrackerStatus = "active" | "paused" | "stopped";

export interface LiveTrackerMatchSummary {
  readonly matchId: string;
  readonly gameTypeAndMap: string;
  readonly gameType: string;
  readonly gameMap: string;
  readonly gameMapThumbnailUrl: string;
  readonly duration: string;
  readonly gameScore: string;
  readonly gameSubScore: string | null;
  readonly endTime: string;
  readonly playerXuidToGametag: Record<string, string>;
}

export interface LiveTrackerPlayer {
  readonly id: string;
  readonly discordUsername: string;
}

export interface LiveTrackerTeam {
  readonly name: string;
  readonly playerIds: readonly string[];
}

export interface LiveTrackerStateData {
  readonly guildId: string;
  readonly guildName: string;
  readonly channelId: string;
  readonly queueNumber: number;
  readonly status: LiveTrackerStatus;
  readonly players: readonly LiveTrackerPlayer[];
  readonly teams: readonly LiveTrackerTeam[];
  readonly substitutions: {
    playerOutId: string;
    playerInId: string;
    teamIndex: number;
    timestamp: string;
  }[];
  readonly discoveredMatches: readonly LiveTrackerMatchSummary[];
  readonly rawMatches: Record<string, unknown>;
  readonly seriesScore: string;
  readonly lastUpdateTime: string;
}

export interface LiveTrackerStateMessage {
  readonly type: "state";
  readonly data: LiveTrackerStateData;
  readonly timestamp: string;
}

export interface LiveTrackerStoppedMessage {
  readonly type: "stopped";
}

export type LiveTrackerMessage = LiveTrackerStateMessage | LiveTrackerStoppedMessage;
