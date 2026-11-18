import { compareDesc, isAfter } from "date-fns";
import type { MatchStats } from "halo-infinite-api";
import type { ConfiguredTeamContext } from "@guilty-spark/shared/contracts/stats/detail";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import {
  buildPresentAtBeginningTeamRosters,
  resolveSeriesTeamMapping,
} from "@guilty-spark/shared/halo/series-team-identity";
import type { SeriesTeamRoster } from "@guilty-spark/shared/halo/series-team-identity";
import { applyRosterSubstitution } from "../../base/roster-substitution";
import type { ManualSeriesTeamMappings } from "./manual-series-team-mapping";

function playerIdsAt(context: ConfiguredTeamContext, startTime: string): string[][] | null {
  const teams = context.teams.map((team) => [...team.playerIds]);
  if (teams.some((team) => new Set(team).size !== team.length)) {
    return null;
  }
  if (new Set(teams.flat()).size !== teams.reduce((count, team) => count + team.length, 0)) {
    return null;
  }
  const substitutions = [...context.substitutions]
    .reverse()
    .sort((left, right) => compareDesc(left.timestamp, right.timestamp));
  for (const substitution of substitutions) {
    if (!isAfter(substitution.timestamp, startTime)) {
      continue;
    }
    const team = teams[substitution.teamIndex];
    if (team?.includes(substitution.playerInId) !== true) {
      return null;
    }
    applyRosterSubstitution(teams, {
      playerOutId: substitution.playerInId,
      playerInId: substitution.playerOutId,
      getId: (id) => id,
      createPlayerIn: () => substitution.playerOutId,
    });
  }
  return teams;
}

function rostersAt(context: ConfiguredTeamContext, startTime: string): SeriesTeamRoster[] | null {
  const teams = playerIdsAt(context, startTime);
  if (teams == null) {
    return null;
  }
  const seenXuids = new Set<string>();
  const rosters: SeriesTeamRoster[] = [];
  for (const [seriesTeamId, playerIds] of teams.entries()) {
    const xuids = new Set<string>();
    for (const playerId of playerIds) {
      const xboxId = context.playersAssociationData[playerId]?.xboxId;
      const xuid = xboxId == null ? null : unwrapXuid(xboxId);
      if (xuid == null || !/^\d+$/.test(xuid) || seenXuids.has(xuid)) {
        return null;
      }
      seenXuids.add(xuid);
      xuids.add(xuid);
    }
    rosters.push({ seriesTeamId, xuids });
  }
  return rosters;
}

export function resolveConfiguredSeriesTeamMappings(
  matches: readonly MatchStats[],
  context: ConfiguredTeamContext,
): ManualSeriesTeamMappings | null {
  if (
    matches.length === 0 ||
    context.teams.length !== 2 ||
    context.teams.some((team) => team.playerIds.length === 0) ||
    context.substitutions.some((substitution) => substitution.teamIndex >= context.teams.length)
  ) {
    return null;
  }
  const matchTeamIdToSeriesTeamId = new Map<string, ReadonlyMap<number, number>>();
  for (const match of matches) {
    const expected = rostersAt(context, match.MatchInfo.StartTime);
    const rawRosters = buildPresentAtBeginningTeamRosters(match);
    if (expected == null || rawRosters == null) {
      return null;
    }
    const rosters = rawRosters.map((roster) => ({
      ...roster,
      xuids: new Set([...roster.xuids].map(unwrapXuid)),
    }));
    if (
      rosters.reduce((count, roster) => count + roster.xuids.size, 0) !==
      match.Players.filter((player) => player.ParticipationInfo.PresentAtBeginning).length
    ) {
      return null;
    }
    const resolution = resolveSeriesTeamMapping(expected, rosters);
    if (resolution == null) {
      return null;
    }
    const mapping = new Map(resolution.map((entry) => [entry.matchTeamId, entry.seriesTeamId]));
    matchTeamIdToSeriesTeamId.set(match.MatchId, mapping);
  }
  return { playerToSeriesTeamId: new Map(), matchTeamIdToSeriesTeamId };
}
