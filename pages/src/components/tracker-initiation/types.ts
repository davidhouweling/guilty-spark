export interface MatchHistoryEntry {
  readonly matchId: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly duration: string;
  readonly mapName: string;
  readonly modeName: string;
  readonly outcome: string;
  readonly resultString: string;
  readonly isMatchmaking: boolean;
  readonly teams: readonly (readonly string[])[];
  readonly mapThumbnailUrl: string;
}

export interface MatchHistoryResponse {
  readonly gamertag: string;
  readonly xuid: string;
  readonly matches: MatchHistoryEntry[];
  suggestedGroupings: string[][];
}
