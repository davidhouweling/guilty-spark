export interface LiveTrackerIdentity {
  readonly guildId: string;
  readonly channelId: string;
  readonly queueNumber: string;
}

export interface LiveTrackerMatchSummary {
  readonly matchId: string;
  readonly gameTypeAndMap: string;
  readonly duration: string;
  readonly gameScore: string;
  readonly endTime: string;
}

export interface LiveTrackerDiscordUser {
  readonly id: string;
  readonly username: string;
  readonly global_name: string | null;
  readonly avatar: string | null;
}

export interface LiveTrackerGuildMember {
  readonly nick: string | null;
  readonly user: LiveTrackerDiscordUser;
}

export interface LiveTrackerTeam {
  readonly name: string;
  readonly playerIds: readonly string[];
}

export interface LiveTrackerStateData {
  readonly userId: string;
  readonly guildId: string;
  readonly channelId: string;
  readonly queueNumber: number;
  readonly status: string;
  readonly players: Readonly<Record<string, LiveTrackerGuildMember>>;
  readonly teams: readonly LiveTrackerTeam[];
  readonly discoveredMatches: Readonly<Record<string, LiveTrackerMatchSummary>>;
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
