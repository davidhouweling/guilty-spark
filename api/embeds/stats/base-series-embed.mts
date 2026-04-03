import type { GameVariantCategory, MatchStats, Stats } from "halo-infinite-api";
import type { APIEmbed } from "discord-api-types/v10";
import {
  mergeCoreStats as mergeSharedCoreStats,
  adjustAveragesInCoreStats as adjustSharedCoreStatsAverages,
} from "@guilty-spark/shared/halo/series-core-stats";
import type { EmbedPlayerStats } from "./base-match-embed.mjs";
import { BaseMatchEmbed } from "./base-match-embed.mjs";

export abstract class BaseSeriesEmbed extends BaseMatchEmbed<GameVariantCategory.MultiplayerSlayer> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  override async getEmbed(_match: MatchStats, _players: Map<string, string>): Promise<APIEmbed> {
    return Promise.reject(new Error("Series embed does not implement getEmbed, use getSeriesEmbed instead"));
  }

  override getPlayerObjectiveStats(): EmbedPlayerStats {
    return new Map([]);
  }

  protected mergeCoreStats(
    existingCoreStats: Stats["CoreStats"],
    incomingCoreStats: Stats["CoreStats"],
  ): Stats["CoreStats"] {
    return mergeSharedCoreStats(existingCoreStats, incomingCoreStats);
  }

  protected adjustAveragesInCoreStats(coreStats: Stats["CoreStats"], matches: number): Stats["CoreStats"] {
    return adjustSharedCoreStatsAverages(coreStats, matches);
  }
}
