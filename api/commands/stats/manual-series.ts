import type { MatchStats } from "halo-infinite-api";
import type { TeamMapping } from "@guilty-spark/shared/live-tracker/series-types";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";

export const MANUAL_QUEUE_NUMBER_MIN = 1_000_000_000;

/**
 * Manual series without a queue number use the UTC creation time as `YYYYMMDDHHmmss`, well above real NeatQueue numbers.
 */
export function allocateManualQueueNumber(now: Date = new Date()): number {
  return Number(now.toISOString().replace(/\D/g, "").slice(0, 14));
}

export function deriveManualSeriesTeams(
  series: readonly MatchStats[],
  xuidToDiscordId: ReadonlyMap<string, string>,
): TeamMapping[] {
  const [firstMatch] = [...series].sort((left, right) =>
    left.MatchInfo.StartTime.localeCompare(right.MatchInfo.StartTime),
  );
  if (firstMatch == null) {
    return [];
  }

  return [...firstMatch.Teams]
    .sort((left, right) => left.TeamId - right.TeamId)
    .map((team) => ({
      name: getTeamName(team.TeamId),
      playerIds: firstMatch.Players.filter(
        (player) =>
          player.PlayerType === 1 && player.ParticipationInfo.PresentAtBeginning && player.LastTeamId === team.TeamId,
      ).flatMap((player) => {
        const discordId = xuidToDiscordId.get(getPlayerXuid(player));
        return discordId == null ? [] : [discordId];
      }),
    }));
}
