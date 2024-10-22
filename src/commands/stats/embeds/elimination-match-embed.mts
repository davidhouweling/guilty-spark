import { GameVariantCategory } from "halo-infinite-api";
import { BaseMatchEmbed, PlayerStats } from "./base-match-embed.mjs";

export class EliminationMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerElimination> {
  override getPlayerObjectiveStats(
    stats: PlayerStats<GameVariantCategory.MultiplayerElimination>,
  ): Map<string, string> {
    return new Map([
      ["Eliminations", stats.EliminationStats.Eliminations.toString()],
      ["Elimination assists", stats.EliminationStats.EliminationAssists.toString()],
      ["Allies revived", stats.EliminationStats.AlliesRevived.toString()],
      ["Rounds Survived", stats.EliminationStats.RoundsSurvived.toString()],
      ["Times revived by ally", stats.EliminationStats.TimesRevivedByAlly.toString()],
      ["Enemy revives denied", stats.EliminationStats.EnemyRevivesDenied.toString()],
    ]);
  }
}
