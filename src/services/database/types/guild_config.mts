export enum StatsReturnType {
  SERIES_ONLY = "S",
  SERIES_AND_GAMES = "A",
}

export enum MapsPostType {
  AUTO = "A",
  BUTTON = "B",
  OFF = "O",
}

export enum MapsPlaylistType {
  HCS_CURRENT = "C",
  HCS_HISTORICAL = "H",
}

export enum MapsFormatType {
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
  NeatQueueInformerMapsPost: MapsPostType;
  NeatQueueInformerMapsPlaylist: MapsPlaylistType;
  NeatQueueInformerMapsFormat: MapsFormatType;
  NeatQueueInformerMapsCount: number;
}
