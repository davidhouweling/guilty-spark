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
  readonly startTime: string;
  readonly endTime: string;
  readonly playerXuidToGametag: Record<string, string>;
}

export interface LiveTrackerPlayer {
  readonly id: string;
  readonly discordUsername: string;
}

export interface PlayerAssociationData {
  readonly discordId: string;
  readonly discordName: string;
  readonly xboxId: string | null;
  readonly gamertag: string | null;
  readonly currentRank: number | null;
  readonly currentRankTier: string | null;
  readonly currentRankSubTier: number | null;
  readonly currentRankMeasurementMatchesRemaining: number | null;
  readonly currentRankInitialMeasurementMatches: number | null;
  readonly allTimePeakRank: number | null;
  readonly esra: number | null;
  readonly lastRankedGamePlayed: string | null;
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
  readonly medalMetadata: Record<number, { name: string; sortingWeight: number }>;
  readonly playersAssociationData: Record<string, PlayerAssociationData> | null;
  readonly matchGroupings?: Record<
    string,
    {
      groupId: string;
      matchIds: readonly string[];
      seriesId?: {
        guildId: string;
        queueNumber: number;
      };
    }
  >;
}

export interface LiveTrackerStateMessage {
  readonly type: "state";
  readonly data: LiveTrackerStateData;
  readonly timestamp: string;
}

export type LiveTrackerMessage = LiveTrackerStateMessage;
