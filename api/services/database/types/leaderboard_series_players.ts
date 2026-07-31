export interface LeaderboardSeriesPlayersRow {
  GuildId: string;
  QueueNumber: number;
  QueueChannelId: string;
  XboxXuid: string;
  DiscordUserId: string | null;
  GamertagSnapshot: string;
  TeamId: number;
  PresentAtBeginningCount: number;
  SubstituteInCount: number;
  SubstituteOutCount: number;
  GamesPlayedCount: number;
  SeriesWon: 0 | 1;
  CreatedAt: number;
}
