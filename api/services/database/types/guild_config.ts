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
  LUCID_EVO = "L",
  RANKED_ARENA = "R",
  RANKED_SLAYER = "S",
  RANKED_SNIPERS = "N",
  RANKED_TACTICAL = "T",
  RANKED_DOUBLES = "D",
  RANKED_FFA = "F",
  RANKED_SQUAD_BATTLE = "Q",
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
  NeatQueueInformerLiveTracking: "Y" | "N";
  NeatQueueInformerLiveTrackingChannelName: "Y" | "N";
  NeatQueueInformerMapsPost: MapsPostType;
  NeatQueueInformerMapsPlaylist: MapsPlaylistType;
  NeatQueueInformerMapsFormat: MapsFormatType;
  NeatQueueInformerMapsCount: number;
}
