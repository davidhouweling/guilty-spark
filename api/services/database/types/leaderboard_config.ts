export enum LeaderboardWindow {
  OneWeek = "1W",
  OneMonth = "1M",
  ThreeMonths = "3M",
  SixMonths = "6M",
  TwelveMonths = "12M",
}

export enum LeaderboardMetric {
  SeriesWinRate = "SERIES_WIN_RATE",
  Kills = "KILLS",
  Deaths = "DEATHS",
  Assists = "ASSISTS",
  Kda = "KDA",
  Accuracy = "ACCURACY",
  DamageDealt = "DAMAGE_DEALT",
  DamageTaken = "DAMAGE_TAKEN",
  DamageRatio = "DAMAGE_RATIO",
  PersonalScore = "PERSONAL_SCORE",
}

export interface LeaderboardConfigRow {
  GuildId: string;
  EnabledWindowsJson: string;
  DefaultWindow: LeaderboardWindow;
  DefaultMetric: LeaderboardMetric;
  MinGamesPlayed: number;
  UpdatedAt: number;
}
