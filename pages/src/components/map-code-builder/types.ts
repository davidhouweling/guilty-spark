export type MapCodeBuilderFormat = "HCS" | "R" | "O" | "S";
export type MapCodeBuilderPlaylist = "current" | "historical";
export interface MapCodeBuilderMatch {
  readonly mode: string;
  readonly map: string;
}
export interface MapCodeBuilderSlot {
  readonly id: number;
  readonly match: MapCodeBuilderMatch | null;
  readonly draft: MapCodeBuilderMatch;
  readonly editing: boolean;
}
export interface MapCodeBuilderOption {
  readonly label: string;
  readonly image: string | null;
}
export interface MapCodeBuilderSnapshot {
  readonly count: number;
  readonly format: MapCodeBuilderFormat;
  readonly playlist: MapCodeBuilderPlaylist;
  readonly slots: readonly MapCodeBuilderSlot[];
  readonly notice: string | null;
}
export interface MapCodeBuilderSlotModel {
  readonly id: number;
  readonly editing: boolean;
  readonly matchLabel: string;
  readonly code: string;
  readonly label: string;
  readonly background: string;
  readonly modeIcon: string;
  readonly draftMode: string;
  readonly draftMap: string;
  readonly modes: readonly MapCodeBuilderOption[];
  readonly maps: readonly MapCodeBuilderOption[];
  readonly canSave: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
}
export interface MapCodeBuilderViewModel {
  readonly count: number;
  readonly format: MapCodeBuilderFormat;
  readonly playlist: MapCodeBuilderPlaylist;
  readonly slots: readonly MapCodeBuilderSlotModel[];
  readonly code: string;
  readonly discordCommand: string;
  readonly matchCountLabel: string;
  readonly notice: string | null;
}
