export enum LeaderboardPlayerRelationshipMetric {
  AvgHeadToHeadKills = "AVG_HEAD_TO_HEAD_KILLS",
  AvgHeadToHeadDeaths = "AVG_HEAD_TO_HEAD_DEATHS",
  TotalHeadToHeadKills = "TOTAL_HEAD_TO_HEAD_KILLS",
  TotalHeadToHeadDeaths = "TOTAL_HEAD_TO_HEAD_DEATHS",
  SeriesPlayedWith = "SERIES_PLAYED_WITH",
  SeriesPlayedAgainst = "SERIES_PLAYED_AGAINST",
  SeriesWinRateWith = "SERIES_WIN_RATE_WITH",
  SeriesWinRateAgainst = "SERIES_WIN_RATE_AGAINST",
  GamesPlayedWith = "GAMES_PLAYED_WITH",
  GamesPlayedAgainst = "GAMES_PLAYED_AGAINST",
  GamesWinRateWith = "GAMES_WIN_RATE_WITH",
  GamesWinRateAgainst = "GAMES_WIN_RATE_AGAINST",
}

export interface LeaderboardPlayerRelationshipRow {
  XboxXuid: string;
  DiscordUserId: string | null;
  Gamertag: string;
  MetricValue: number;
  SharedCount: number;
  Wins: number;
  Perfects: number;
}
