export interface LeaderboardPlayerHeadToHeadSummaryRow {
  XboxXuid: string;
  DiscordUserId: string | null;
  Gamertag: string;
  Kills: number;
  KillsPerfects: number;
  Deaths: number;
  DeathsPerfects: number;
  HeadToHeadGames: number;
  GamesWith: number;
  GameWinsWith: number;
  GamesAgainst: number;
  GameWinsAgainst: number;
  OpponentGameWins: number;
  SeriesWith: number;
  SeriesWinsWith: number;
  SeriesAgainst: number;
  SeriesWinsAgainst: number;
  OpponentSeriesWins: number;
}
