export enum StatsReturnType {
  SERIES_ONLY = "S",
  SERIES_AND_GAMES = "A",
}

export interface GuildConfigRow {
  GuildId: string;
  StatsReturn: StatsReturnType;
  Medals: "Y" | "N";
}
