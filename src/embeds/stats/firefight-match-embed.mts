import type { GameVariantCategory, Stats } from "halo-infinite-api";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed, StatsValueSortBy } from "./base-match-embed.mjs";

export class FirefightMatchEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerFirefight> {
  override getPlayerObjectiveStats(stats: Stats<GameVariantCategory.MultiplayerFirefight>): EmbedPlayerStats {
    return new Map([
      ["Eliminations", { value: stats.EliminationStats.Eliminations, sortBy: StatsValueSortBy.DESC }],
      ["Elimination assists", { value: stats.EliminationStats.EliminationAssists, sortBy: StatsValueSortBy.DESC }],
      ["Allies revived", { value: stats.EliminationStats.AlliesRevived, sortBy: StatsValueSortBy.DESC }],
      ["Rounds Survived", { value: stats.EliminationStats.RoundsSurvived, sortBy: StatsValueSortBy.DESC }],
      ["Times revived by ally", { value: stats.EliminationStats.TimesRevivedByAlly, sortBy: StatsValueSortBy.ASC }],
      ["Enemy revives denied", { value: stats.EliminationStats.EnemyRevivesDenied, sortBy: StatsValueSortBy.DESC }],
      ["Boss kills", { value: stats.PveStats.BossKills, sortBy: StatsValueSortBy.DESC }],
      ["Hunter kills", { value: stats.PveStats.HunterKills, sortBy: StatsValueSortBy.DESC }],
      ["Elite kills", { value: stats.PveStats.EliteKills, sortBy: StatsValueSortBy.DESC }],
      ["Jackal kills", { value: stats.PveStats.JackalKills, sortBy: StatsValueSortBy.DESC }],
      ["Grunt kills", { value: stats.PveStats.GruntKills, sortBy: StatsValueSortBy.DESC }],
      ["Brute kills", { value: stats.PveStats.BruteKills, sortBy: StatsValueSortBy.DESC }],
      ["Sentinel kills", { value: stats.PveStats.SentinelKills, sortBy: StatsValueSortBy.DESC }],
      ["Skimmer kills", { value: stats.PveStats.SkimmerKills, sortBy: StatsValueSortBy.DESC }],
    ]);
  }
}
