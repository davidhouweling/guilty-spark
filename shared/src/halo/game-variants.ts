import { GameVariantCategory } from "halo-infinite-api";

const GAME_MODE_NAMES: Record<number, string> = {
  [GameVariantCategory.MultiplayerAttrition]: "Attrition",
  [GameVariantCategory.MultiplayerElimination]: "Elimination",
  [GameVariantCategory.MultiplayerStrongholds]: "Strongholds",
  [GameVariantCategory.MultiplayerKingOfTheHill]: "King of the Hill",
  [GameVariantCategory.MultiplayerTotalControl]: "Total Control",
  [GameVariantCategory.MultiplayerCtf]: "Capture the Flag",
  [GameVariantCategory.MultiplayerExtraction]: "Extraction",
  [GameVariantCategory.MultiplayerOddball]: "Oddball",
  [GameVariantCategory.MultiplayerStockpile]: "Stockpile",
  [GameVariantCategory.MultiplayerInfection]: "Infection",
  [GameVariantCategory.MultiplayerVIP]: "VIP",
  [GameVariantCategory.MultiplayerLandGrab]: "Land Grab",
  [GameVariantCategory.MultiplayerFirefight]: "Firefight",
  [GameVariantCategory.MultiplayerSlayer]: "Slayer",
  [GameVariantCategory.MultiplayerFiesta]: "Fiesta",
  [GameVariantCategory.MultiplayerEscalation]: "Escalation",
  [GameVariantCategory.MultiplayerGrifball]: "Grifball",
  [GameVariantCategory.MultiplayerMinigame]: "Minigame",
};

export function getGameModeName(gameVariantCategory: number): string {
  return GAME_MODE_NAMES[gameVariantCategory] ?? "Unknown";
}
