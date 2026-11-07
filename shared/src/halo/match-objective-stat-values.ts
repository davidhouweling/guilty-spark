import { GameVariantCategory } from "halo-infinite-api";
import type { Stats } from "halo-infinite-api";
import { Preconditions } from "../base/preconditions";
import {
  getEliminationObjectiveStats,
  getEmptyObjectiveStats,
  getExtractionObjectiveStats,
  getFirefightObjectiveStats,
} from "./objective-stats";
import {
  getCtfObjectiveStatValues,
  getInfectionObjectiveStatValues,
  getKothObjectiveStatValues,
  getOddballObjectiveStatValues,
  getStockpileObjectiveStatValues,
  getStrongholdsObjectiveStatValues,
  getVipObjectiveStatValues,
} from "./objective-stats-values";
import type { StatsCollection } from "./types";

export function getMatchObjectiveStatValues(stats: Stats, category: GameVariantCategory): StatsCollection {
  switch (category) {
    case GameVariantCategory.MultiplayerCtf: {
      if (!("CaptureTheFlagStats" in stats)) {
        throw new Error("CTF stats require CaptureTheFlagStats");
      }
      Preconditions.checkExists(stats.CaptureTheFlagStats, "CTF stats require CaptureTheFlagStats");
      return getCtfObjectiveStatValues(stats);
    }
    case GameVariantCategory.MultiplayerElimination: {
      if (!("EliminationStats" in stats)) {
        throw new Error("Elimination stats require EliminationStats");
      }
      Preconditions.checkExists(stats.EliminationStats, "Elimination stats require EliminationStats");
      return getEliminationObjectiveStats(stats);
    }
    case GameVariantCategory.MultiplayerExtraction: {
      if (!("ExtractionStats" in stats)) {
        throw new Error("Extraction stats require ExtractionStats");
      }
      Preconditions.checkExists(stats.ExtractionStats, "Extraction stats require ExtractionStats");
      return getExtractionObjectiveStats(stats);
    }
    case GameVariantCategory.MultiplayerFirefight: {
      if (!("EliminationStats" in stats) || !("PveStats" in stats)) {
        throw new Error("Firefight stats require EliminationStats and PveStats");
      }
      Preconditions.checkExists(stats.EliminationStats, "Firefight stats require EliminationStats and PveStats");
      Preconditions.checkExists(stats.PveStats, "Firefight stats require EliminationStats and PveStats");
      return getFirefightObjectiveStats(stats);
    }
    case GameVariantCategory.MultiplayerInfection: {
      if (!("InfectionSTats" in stats)) {
        throw new Error("Infection stats require InfectionSTats");
      }
      Preconditions.checkExists(stats.InfectionSTats, "Infection stats require InfectionSTats");
      return getInfectionObjectiveStatValues(stats);
    }
    case GameVariantCategory.MultiplayerKingOfTheHill: {
      if (!("ZonesStats" in stats)) {
        throw new Error("King of the Hill stats require ZonesStats");
      }
      Preconditions.checkExists(stats.ZonesStats, "King of the Hill stats require ZonesStats");
      return getKothObjectiveStatValues(stats);
    }
    case GameVariantCategory.MultiplayerOddball: {
      if (!("OddballStats" in stats)) {
        throw new Error("Oddball stats require OddballStats");
      }
      Preconditions.checkExists(stats.OddballStats, "Oddball stats require OddballStats");
      return getOddballObjectiveStatValues(stats);
    }
    case GameVariantCategory.MultiplayerStockpile: {
      if (!("StockpileStats" in stats)) {
        throw new Error("Stockpile stats require StockpileStats");
      }
      Preconditions.checkExists(stats.StockpileStats, "Stockpile stats require StockpileStats");
      return getStockpileObjectiveStatValues(stats);
    }
    case GameVariantCategory.MultiplayerStrongholds: {
      if (!("ZonesStats" in stats)) {
        throw new Error("Strongholds stats require ZonesStats");
      }
      Preconditions.checkExists(stats.ZonesStats, "Strongholds stats require ZonesStats");
      return getStrongholdsObjectiveStatValues(stats);
    }
    case GameVariantCategory.MultiplayerVIP: {
      if (!("VipStats" in stats)) {
        throw new Error("VIP stats require VipStats");
      }
      Preconditions.checkExists(stats.VipStats, "VIP stats require VipStats");
      return getVipObjectiveStatValues(stats);
    }
    case GameVariantCategory.MultiplayerSlayer: {
      return getEmptyObjectiveStats();
    }
    case GameVariantCategory.MultiplayerAttrition: {
      return getEmptyObjectiveStats();
    }
    case GameVariantCategory.MultiplayerTotalControl: {
      return getEmptyObjectiveStats();
    }
    case GameVariantCategory.MultiplayerFiesta: {
      return getEmptyObjectiveStats();
    }
    case GameVariantCategory.MultiplayerEscalation: {
      return getEmptyObjectiveStats();
    }
    case GameVariantCategory.MultiplayerGrifball: {
      return getEmptyObjectiveStats();
    }
    case GameVariantCategory.MultiplayerLandGrab: {
      return getEmptyObjectiveStats();
    }
    case GameVariantCategory.MultiplayerMinigame: {
      return getEmptyObjectiveStats();
    }
    default: {
      return getEmptyObjectiveStats();
    }
  }
}
