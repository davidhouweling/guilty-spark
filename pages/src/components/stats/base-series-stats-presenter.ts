import type { MatchStats, Stats } from "halo-infinite-api";
import * as tinyduration from "tinyduration";

export abstract class BaseSeriesStatsPresenter {
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
      .map((duration) => this.getDurationInSeconds(duration))
      .reduce((a, b) => a + b, 0);
    const accAverageLifeDuration = accLifeDurationInSeconds / averageLifeDurations.length;
    return this.getDurationInIsoString(accAverageLifeDuration);
  }

  protected getDurationInSeconds(duration: string): number {
    const parsedDuration = tinyduration.parse(duration);
    return parseFloat(
      (
        (parsedDuration.days ?? 0) * 86400 +
        (parsedDuration.hours ?? 0) * 3600 +
        (parsedDuration.minutes ?? 0) * 60 +
        (parsedDuration.seconds ?? 0)
      ).toFixed(1),
    );
  }

  private getDurationInIsoString(durationInSeconds: number): string {
    const hours = Math.floor(durationInSeconds / 3600);
    const minutes = Math.floor((durationInSeconds % 3600) / 60);
    const seconds = durationInSeconds % 60;

    let output = "PT";
    if (hours > 0) {
      output += `${hours.toString()}H`;
    }
    if (minutes > 0) {
      output += `${minutes.toString()}M`;
    }
    if (seconds > 0) {
      output += `${seconds.toFixed(1)}S`;
    }

    return output === "PT" ? "PT0S" : output;
  }

  protected getTeamPlayersFromMatches(matches: MatchStats[], team: MatchStats["Teams"][0]): MatchStats["Players"] {
    const uniquePlayersMap = new Map<string, MatchStats["Players"][0]>();
    for (const match of matches) {
      for (const player of match.Players) {
        if (!player.ParticipationInfo.PresentAtBeginning) {
          continue;
        }

        if (!uniquePlayersMap.has(player.PlayerId)) {
          uniquePlayersMap.set(player.PlayerId, player);
        }
      }
    }

    return Array.from(uniquePlayersMap.values()).filter(
      (player): boolean => player.PlayerTeamStats.find((teamStats) => teamStats.TeamId === team.TeamId) != null,
    );
  }

  public getPlayerXuid(player: Pick<MatchStats["Players"][0], "PlayerId">): string {
    return player.PlayerId.replace(/^xuid\((\d+)\)$/, "$1");
  }
}
