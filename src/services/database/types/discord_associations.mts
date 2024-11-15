export enum AssociationReason {
  CONNECTED = "C",
  MANUAL = "M",
  USERNAME_SEARCH = "U",
  DISPLAY_NAME_SEARCH = "D",
  GAME_SIMILARITY = "G",
  UNKNOWN = "?",
}

export enum GamesRetrievable {
  YES = "Y",
  NO = "N",
  UNKNOWN = "?",
}

export interface DiscordAssociationsRow {
  DiscordId: string;
  XboxId: string;
  AssociationReason: AssociationReason;
  AssociationDate: string;
  GamesRetrievable: GamesRetrievable;
}