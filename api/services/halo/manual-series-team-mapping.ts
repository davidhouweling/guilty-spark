import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { buildPresentAtBeginningTeamRosters } from "@guilty-spark/shared/halo/series-team-identity";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";

export interface ManualSeriesTeamMappings {
  playerToSeriesTeamId: ReadonlyMap<string, number>;
  matchTeamIdToSeriesTeamId: ReadonlyMap<string, ReadonlyMap<number, number>>;
}

function getRosterOverlap(roster: ReadonlySet<string>, anchorRoster: ReadonlySet<string>): number {
  let overlap = 0;
  for (const playerId of roster) {
    if (anchorRoster.has(playerId)) {
      overlap += 1;
    }
  }

  return overlap;
}

export function resolveManualSeriesTeamMappings(series: MatchStats[]): ManualSeriesTeamMappings | null {
  const matches = [...series].sort((left, right) => left.MatchInfo.StartTime.localeCompare(right.MatchInfo.StartTime));
  const [firstMatch] = matches;
  if (firstMatch == null) {
    return null;
  }

  const anchorRosters = buildPresentAtBeginningTeamRosters(firstMatch);
  if (anchorRosters == null) {
    return null;
  }

  const anchorTeamIds = anchorRosters.map((roster) => roster.matchTeamId);
  const [anchorTeam0, anchorTeam1] = anchorTeamIds;
  if (anchorTeam0 == null || anchorTeam1 == null) {
    return null;
  }

  const anchorPlayersByTeam = new Map<number, Set<string>>(
    anchorRosters.map((roster) => [roster.matchTeamId, new Set(roster.xuids)]),
  );
  const playerToSeriesTeamId = new Map<string, number>();
  const matchTeamIdToSeriesTeamId = new Map<string, ReadonlyMap<number, number>>();

  for (const [index, match] of matches.entries()) {
    const matchTeamIds = [...match.Teams].map((team) => team.TeamId).sort((left, right) => left - right);
    const [firstTeamId, secondTeamId] = matchTeamIds;
    if (firstTeamId == null || secondTeamId == null || matchTeamIds.length !== 2) {
      return null;
    }

    const playersByMatchTeam = new Map<number, Set<string>>();
    for (const player of match.Players) {
      if (player.PlayerType !== 1) {
        continue;
      }

      const players = playersByMatchTeam.get(player.LastTeamId) ?? new Set<string>();
      players.add(player.PlayerId);
      playersByMatchTeam.set(player.LastTeamId, players);
    }

    const firstRoster = playersByMatchTeam.get(firstTeamId) ?? new Set<string>();
    const secondRoster = playersByMatchTeam.get(secondTeamId) ?? new Set<string>();
    const firstAnchorPlayers = Preconditions.checkExists(anchorPlayersByTeam.get(anchorTeam0));
    const secondAnchorPlayers = Preconditions.checkExists(anchorPlayersByTeam.get(anchorTeam1));
    const sameSideOverlap =
      getRosterOverlap(firstRoster, firstAnchorPlayers) + getRosterOverlap(secondRoster, secondAnchorPlayers);
    const swappedSideOverlap =
      getRosterOverlap(firstRoster, secondAnchorPlayers) + getRosterOverlap(secondRoster, firstAnchorPlayers);

    if (index > 0 && sameSideOverlap === swappedSideOverlap) {
      return null;
    }

    const firstTeamSeriesId = index === 0 || sameSideOverlap > swappedSideOverlap ? anchorTeam0 : anchorTeam1;
    const secondTeamSeriesId = index === 0 || sameSideOverlap > swappedSideOverlap ? anchorTeam1 : anchorTeam0;

    matchTeamIdToSeriesTeamId.set(
      match.MatchId,
      new Map([
        [firstTeamId, firstTeamSeriesId],
        [secondTeamId, secondTeamSeriesId],
      ]),
    );

    for (const player of match.Players) {
      if (player.PlayerType !== 1) {
        continue;
      }

      const seriesTeamId = player.LastTeamId === firstTeamId ? firstTeamSeriesId : secondTeamSeriesId;
      const playerXuid = getPlayerXuid(player);
      const previousSeriesTeamId = playerToSeriesTeamId.get(playerXuid);
      if (previousSeriesTeamId != null && previousSeriesTeamId !== seriesTeamId) {
        return null;
      }
      playerToSeriesTeamId.set(playerXuid, seriesTeamId);
      Preconditions.checkExists(anchorPlayersByTeam.get(seriesTeamId)).add(player.PlayerId);
    }
  }

  return { playerToSeriesTeamId, matchTeamIdToSeriesTeamId };
}

export function mapManualSeriesToStableTeams(series: MatchStats[], mappings: ManualSeriesTeamMappings): MatchStats[] {
  const firstMatch = Preconditions.checkExists(
    [...series].sort((left, right) => left.MatchInfo.StartTime.localeCompare(right.MatchInfo.StartTime))[0],
    "Expected initial manual series match",
  );
  const initialTeamMapping = Preconditions.checkExists(
    mappings.matchTeamIdToSeriesTeamId.get(firstMatch.MatchId),
    "Expected initial manual series team mapping",
  );
  const stableTeamIds = [...new Set(initialTeamMapping.values())].sort((left, right) => left - right);
  if (stableTeamIds.length !== 2) {
    throw new Error("Expected exactly two stable manual series teams");
  }

  return series.map((match) => {
    const teamMapping = Preconditions.checkExists(
      mappings.matchTeamIdToSeriesTeamId.get(match.MatchId),
      "Expected resolved manual series team mapping",
    );

    return {
      ...match,
      Teams: match.Teams.map((team) => ({
        ...team,
        TeamId: Preconditions.checkExists(teamMapping.get(team.TeamId), "Expected mapped manual team ID"),
      })).sort((left, right) => left.TeamId - right.TeamId),
      Players: match.Players.map((player) => ({
        ...player,
        LastTeamId: Preconditions.checkExists(teamMapping.get(player.LastTeamId), "Expected mapped player team ID"),
        PlayerTeamStats: player.PlayerTeamStats.map((teamStats) => ({
          ...teamStats,
          TeamId: teamMapping.get(teamStats.TeamId) ?? teamStats.TeamId,
        })),
      })),
    };
  });
}
