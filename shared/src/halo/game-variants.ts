import { GameVariantCategory } from "halo-infinite-api";

export function getGameModeName(gameVariantCategory: GameVariantCategory): string {
  switch (gameVariantCategory) {
    case GameVariantCategory.MultiplayerAttrition: {
      return "Attrition";
    }
    case GameVariantCategory.MultiplayerElimination: {
      return "Elimination";
    }
    case GameVariantCategory.MultiplayerStrongholds: {
      return "Strongholds";
    }
    case GameVariantCategory.MultiplayerKingOfTheHill: {
      return "King of the Hill";
    }
    case GameVariantCategory.MultiplayerTotalControl: {
      return "Total Control";
    }
    case GameVariantCategory.MultiplayerCtf: {
      return "Capture the Flag";
    }
    case GameVariantCategory.MultiplayerExtraction: {
      return "Extraction";
    }
    case GameVariantCategory.MultiplayerOddball: {
      return "Oddball";
    }
    case GameVariantCategory.MultiplayerStockpile: {
      return "Stockpile";
    }
    case GameVariantCategory.MultiplayerInfection: {
      return "Infection";
    }
    case GameVariantCategory.MultiplayerVIP: {
      return "VIP";
    }
    case GameVariantCategory.MultiplayerLandGrab: {
      return "Land Grab";
    }
    case GameVariantCategory.MultiplayerFirefight: {
      return "Firefight";
    }
    case GameVariantCategory.MultiplayerSlayer: {
      return "Slayer";
    }
    case GameVariantCategory.MultiplayerFiesta: {
      return "Fiesta";
    }
    case GameVariantCategory.MultiplayerEscalation: {
      return "Escalation";
    }
    case GameVariantCategory.MultiplayerGrifball: {
      return "Grifball";
    }
    case GameVariantCategory.MultiplayerMinigame: {
      return "Minigame";
    }
    default: {
      return "Unknown";
    }
  }
}
