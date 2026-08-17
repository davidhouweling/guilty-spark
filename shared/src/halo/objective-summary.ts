import type { MatchStats } from "halo-infinite-api";
import { getObjectiveTimeSeconds } from "./objective-metrics";

export interface PlayerObjectiveSummary {
  objectiveTimeSeconds: number;
  objectiveGamesPlayed: number;
  objectiveTeamContribution: number | null;
  objectiveTeamContributionGamesPlayed: number;
}

function getActivePlayerTeamStats(
  match: MatchStats,
  playerId: string,
): MatchStats["Players"][number]["PlayerTeamStats"][number] | null {
  const player = match.Players.find(
    (matchPlayer) => matchPlayer.PlayerId === playerId && matchPlayer.ParticipationInfo.PresentAtBeginning,
  );
  if (player == null) {
    return null;
  }

  return (
    player.PlayerTeamStats.find((teamStats) => teamStats.TeamId === player.LastTeamId) ??
    player.PlayerTeamStats[0] ??
    null
  );
}

export function getPlayerObjectiveSummary(matches: MatchStats[], playerId: string): PlayerObjectiveSummary | null {
  let objectiveTimeSeconds = 0;
  let objectiveGamesPlayed = 0;
  let objectiveTeamContributionPlayerTimeTotal = 0;
  let objectiveTeamContributionTeamTimeTotal = 0;
  let objectiveTeamContributionGamesPlayed = 0;

  for (const match of matches) {
    const playerTeamStats = getActivePlayerTeamStats(match, playerId);
    if (playerTeamStats == null) {
      continue;
    }

    const playerObjectiveTimeSeconds = getObjectiveTimeSeconds(
      match.MatchInfo.GameVariantCategory,
      playerTeamStats.Stats,
    );
    if (playerObjectiveTimeSeconds == null) {
      continue;
    }

    objectiveGamesPlayed += 1;
    objectiveTimeSeconds += playerObjectiveTimeSeconds;

    const team = match.Teams.find((candidateTeam) => candidateTeam.TeamId === playerTeamStats.TeamId);
    if (team == null) {
      continue;
    }

    const teamObjectiveTimeSeconds = getObjectiveTimeSeconds(match.MatchInfo.GameVariantCategory, team.Stats);
    if (teamObjectiveTimeSeconds == null || teamObjectiveTimeSeconds <= 0) {
      continue;
    }

    objectiveTeamContributionPlayerTimeTotal += playerObjectiveTimeSeconds;
    objectiveTeamContributionTeamTimeTotal += teamObjectiveTimeSeconds;
    objectiveTeamContributionGamesPlayed += 1;
  }

  if (objectiveGamesPlayed === 0) {
    return null;
  }

  return {
    objectiveTimeSeconds,
    objectiveGamesPlayed,
    objectiveTeamContribution:
      objectiveTeamContributionGamesPlayed === 0
        ? null
        : objectiveTeamContributionPlayerTimeTotal / objectiveTeamContributionTeamTimeTotal,
    objectiveTeamContributionGamesPlayed,
  };
}
