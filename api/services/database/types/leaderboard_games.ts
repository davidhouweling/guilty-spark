export interface LeaderboardGamesRow {
  MatchId: string;
  GuildId: string;
  QueueNumber: number;
  QueueChannelId: string;
  GameIndexInSeries: number;
  GameVariantCategory: number;
  ModeName: string;
  MapName: string;
  MapAssetId: string | null;
  MapVersionId: string | null;
  Team0Score: number | null;
  Team1Score: number | null;
  StartedAt: number;
  EndedAt: number;
  CreatedAt: number;
}
