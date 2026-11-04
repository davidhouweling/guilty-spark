export type MapCodeBuilderFormat = "HCS" | "R" | "O" | "S";
export type MapCodeBuilderPlaylist = "current" | "historical";

export interface MapCodeBuilderMatch {
  readonly mode: string;
  readonly map: string;
}

export interface MapCodeBuilderMatchViewModel extends MapCodeBuilderMatch {
  readonly code: string;
  readonly matchLabel: string;
  readonly modeAndMapLabel: string;
  readonly modeIconUrl: string;
  readonly thumbnailUrl: string | null;
}

export interface MapCodeBuilderSnapshot {
  readonly count: number;
  readonly format: MapCodeBuilderFormat;
  readonly playlist: MapCodeBuilderPlaylist;
  readonly matches: readonly MapCodeBuilderMatch[];
  readonly notice: string | null;
}

export interface MapCodeBuilderViewModel extends MapCodeBuilderSnapshot {
  readonly matches: readonly MapCodeBuilderMatchViewModel[];
  readonly code: string;
  readonly discordCommand: string;
  readonly matchCountLabel: string;
}
