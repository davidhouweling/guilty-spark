import { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed, PlayerStats } from "./base-match-embed.mjs";

export class FirefightMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerFirefight> {
  override getPlayerObjectiveStats(stats: PlayerStats<GameVariantCategory.MultiplayerFirefight>): Map<string, string> {
    return new Map([
      ["Eliminations", stats.EliminationStats.Eliminations.toString()],
      ["Elimination assists", stats.EliminationStats.EliminationAssists.toString()],
      ["Allies revived", stats.EliminationStats.AlliesRevived.toString()],
      ["Rounds Survived", stats.EliminationStats.RoundsSurvived.toString()],
      ["Times revived by ally", stats.EliminationStats.TimesRevivedByAlly.toString()],
      ["Enemy revives denied", stats.EliminationStats.EnemyRevivesDenied.toString()],
      ["Boss kills", stats.PveStats.BossKills.toString()],
      ["Hunter kills", stats.PveStats.HunterKills.toString()],
      ["Elite kills", stats.PveStats.EliteKills.toString()],
      ["Jackal kills", stats.PveStats.JackalKills.toString()],
      ["Grunt kills", stats.PveStats.GruntKills.toString()],
      ["Brute kills", stats.PveStats.BruteKills.toString()],
      ["Sentinel kills", stats.PveStats.SentinelKills.toString()],
      ["Skimmer kills", stats.PveStats.SkimmerKills.toString()],
    ]);
  }
}
