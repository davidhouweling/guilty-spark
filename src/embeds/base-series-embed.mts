import type { GameVariantCategory, MatchStats, Stats } from "halo-infinite-api";
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

  protected mergeCoreStats(
    existingCoreStats: Stats["CoreStats"],
    incomingCoreStats: Stats["CoreStats"],
  ): Stats["CoreStats"] {
    let mergedCoreStats: Stats["CoreStats"] = { ...existingCoreStats };
    for (const [key, value] of Object.entries(incomingCoreStats)) {
      const castKey = key as keyof Stats["CoreStats"];

      if (castKey === "Medals" || castKey === "PersonalScores") {
        const existingStatMap = new Map(mergedCoreStats[castKey].map((stat) => [stat.NameId, stat]));
        const castValue = value as Stats["CoreStats"]["Medals"];
        for (const statValue of castValue) {
          const existingStat = existingStatMap.get(statValue.NameId);
          if (existingStat) {
            existingStatMap.set(statValue.NameId, {
              ...existingStat,
              Count: existingStat.Count + statValue.Count,
              TotalPersonalScoreAwarded: existingStat.TotalPersonalScoreAwarded + statValue.TotalPersonalScoreAwarded,
            });
          } else {
            existingStatMap.set(statValue.NameId, statValue);
          }
        }

        mergedCoreStats = {
          ...mergedCoreStats,
          [castKey]: Array.from(existingStatMap.values()),
        };
      } else if (castKey === "AverageLifeDuration" && typeof value === "string") {
        const averageLifeDuration = mergedCoreStats[castKey];
        mergedCoreStats = {
          ...mergedCoreStats,
          [castKey]: [averageLifeDuration, value].join(","),
        };
      } else if (typeof value === "number" && typeof mergedCoreStats[castKey] === "number") {
        const oldValue = mergedCoreStats[castKey];
        mergedCoreStats = {
          ...mergedCoreStats,
          [castKey]: oldValue + value,
        };
      } else {
        throw new Error(`Invalid type for key ${key}`);
      }
    }

    return mergedCoreStats;
  }

  protected adjustAveragesInCoreStats(coreStats: Stats["CoreStats"], matches: number): Stats["CoreStats"] {
    return {
      ...coreStats,
      Accuracy: coreStats.Accuracy / matches,
      AverageLifeDuration: this.getAccumulatedAverageLifeDuration(coreStats.AverageLifeDuration),
    };
  }

  private getAccumulatedAverageLifeDuration(averageLifeDuration: string): string {
    const averageLifeDurations = averageLifeDuration.split(",");
    if (averageLifeDurations.length === 1) {
      return averageLifeDuration;
    }

    const accLifeDurationInSeconds = averageLifeDurations
      .map((duration) => this.haloService.getDurationInSeconds(duration))
      .reduce((a, b) => a + b, 0);
    const accAverageLifeDuration = accLifeDurationInSeconds / averageLifeDurations.length;
    return this.haloService.getDurationInIsoString(accAverageLifeDuration);
  }
}
