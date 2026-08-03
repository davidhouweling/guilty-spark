export interface LeaderboardSeriesRow {
  GuildId: string;
  QueueNumber: number;
  QueueChannelId: string;
  ResultsChannelId: string | null;
  StartedAt: number | null;
  CompletedAt: number;
  WinnerTeamIndex: number;
  SeriesScore: string;
  Source: "neatqueue";
  CreatedAt: number;
  UpdatedAt: number;
}
