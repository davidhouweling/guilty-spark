import type { GameVariantCategory, MatchStats } from "halo-infinite-api";
import type { APIEmbed } from "discord-api-types/v10";
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
}
