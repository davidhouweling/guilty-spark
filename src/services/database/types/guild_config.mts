export enum StatsReturnType {
  SERIES_ONLY = "S",
  SERIES_AND_GAMES = "A",
}

export enum NeatQueueInformerMapsPostType {
  AUTO = "A",
  BUTTON = "B",
  OFF = "O",
}

export enum NeatQueueInformerMapsPlaylistType {
  HCS_CURRENT = "C",
  HCS_HISTORICAL = "H",
}

export enum NeatQueueInformerMapsFormatType {
  HCS = "H",
  RANDOM = "R",
  OBJECTIVE = "O",
  SLAYER = "S",
}

export interface GuildConfigRow {
  GuildId: string;
  StatsReturn: StatsReturnType;
  Medals: "Y" | "N";
  NeatQueueInformerPlayerConnections: "Y" | "N";
  NeatQueueInformerMapsPost: NeatQueueInformerMapsPostType;
  NeatQueueInformerMapsPlaylist: NeatQueueInformerMapsPlaylistType;
  NeatQueueInformerMapsFormat: NeatQueueInformerMapsFormatType;
  NeatQueueInformerMapsCount: number;
}
