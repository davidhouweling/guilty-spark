import { compareAsc } from "date-fns";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { seriesMatchDetailBatchSchema, seriesDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import type { MatchDetail, MatchDetailResult, SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import {
  buildPresentAtBeginningTeamRosters,
  resolveMatchTeamIdToSeriesTeamId,
} from "@guilty-spark/shared/halo/series-team-identity";
import { mapManualSeriesToStableTeams, resolveManualSeriesTeamMappings } from "./manual-series-team-mapping";
import type { ManualSeriesTeamMappings } from "./manual-series-team-mapping";
import { mapSeriesDetailAggregation } from "./series-detail-aggregation";
import type { SeriesDetailOptions } from "./types";

function validateRawDetailIdentity(match: MatchStats, detail: MatchDetail): void {
  const teamIds = new Set(match.Teams.map((team) => team.TeamId));
  const playerIds = new Set(match.Players.map((player) => player.PlayerId));
  if (
    teamIds.size !== match.Teams.length ||
    playerIds.size !== match.Players.length ||
    teamIds.size !== detail.teams.length ||
    playerIds.size !== detail.players.length ||
    new Set(detail.teams.map((team) => team.matchTeamId)).size !== teamIds.size ||
    new Set(detail.players.map((player) => player.playerId)).size !== playerIds.size ||
    detail.teams.some((team) => !teamIds.has(team.matchTeamId)) ||
    detail.players.some((player) => !playerIds.has(player.playerId))
  ) {
    throw new Error("Raw match roster identities must match the per-game detail");
  }
}

function validateRawMatches(results: readonly MatchDetailResult[], rawMatches: readonly MatchStats[]): void {
  const resolvedIds = new Set(results.filter((result) => result.status === "resolved").map((result) => result.matchId));
  const rawIds = new Set(rawMatches.map((match) => match.MatchId));
  if (
    rawIds.size !== rawMatches.length ||
    rawIds.size !== resolvedIds.size ||
    [...rawIds].some((id) => !resolvedIds.has(id))
  ) {
    throw new Error("Raw matches must cover exactly the distinct resolved match IDs");
  }
  const rawById = new Map(rawMatches.map((match) => [match.MatchId, match]));
  for (const result of results) {
    if (result.status === "resolved") {
      validateRawDetailIdentity(Preconditions.checkExists(rawById.get(result.matchId)), result.detail);
    }
  }
}

function hasCompleteMapping(match: MatchStats, mapping: ReadonlyMap<number, number> | undefined): boolean {
  return (
    mapping != null &&
    match.Teams.length === 2 &&
    new Set(match.Teams.map((team) => mapping.get(team.TeamId))).size === 2 &&
    match.Teams.every((team) => mapping.has(team.TeamId)) &&
    match.Players.every(
      (player) => mapping.has(player.LastTeamId) && player.PlayerTeamStats.every((stats) => mapping.has(stats.TeamId)),
    )
  );
}

function resolveMappings(matches: MatchStats[], isManualSeries: boolean): ManualSeriesTeamMappings | null {
  if (isManualSeries) {
    const mappings = resolveManualSeriesTeamMappings(matches);
    return mappings != null &&
      matches.every((match) => hasCompleteMapping(match, mappings.matchTeamIdToSeriesTeamId.get(match.MatchId)))
      ? mappings
      : null;
  }
  const [anchor] = matches;
  const anchorRosters = anchor == null ? null : buildPresentAtBeginningTeamRosters(anchor);
  const matchTeamIdToSeriesTeamId = new Map<string, ReadonlyMap<number, number>>();
  for (const match of matches) {
    const mapping = resolveMatchTeamIdToSeriesTeamId(anchorRosters, match);
    if (mapping == null || !hasCompleteMapping(match, mapping)) {
      return null;
    }
    matchTeamIdToSeriesTeamId.set(match.MatchId, mapping);
  }
  return anchor == null ? null : { playerToSeriesTeamId: new Map(), matchTeamIdToSeriesTeamId };
}

function mapScoreSection(
  section: MatchDetail["score"]["primary"],
  mapping: ReadonlyMap<number, number> | undefined,
): MatchDetail["score"]["primary"] {
  return section == null
    ? null
    : {
        ...section,
        teams: section.teams.map((team) => ({ ...team, seriesTeamId: mapping?.get(team.matchTeamId) ?? null })),
      };
}

function mapDetailSeriesSides(detail: MatchDetail, mapping: ReadonlyMap<number, number> | undefined): MatchDetail {
  return {
    ...detail,
    teams: detail.teams.map((team) => ({ ...team, seriesTeamId: mapping?.get(team.matchTeamId) ?? null })),
    players: detail.players.map((player) => ({
      ...player,
      teamStats: player.teamStats.map((stats) => ({
        ...stats,
        seriesTeamId: mapping?.get(stats.matchTeamId) ?? null,
      })),
    })),
    score: {
      primary: mapScoreSection(detail.score.primary, mapping),
      secondary: mapScoreSection(detail.score.secondary, mapping),
    },
  };
}

/** Caller resolves metadata and per-game details; only requested raw matches enter series totals. */
export function mapSeriesDetail(
  seriesId: string,
  matchIds: readonly string[],
  results: readonly MatchDetailResult[],
  rawMatches: readonly MatchStats[],
  options: SeriesDetailOptions = {},
): SeriesDetailResponse {
  const batch = seriesMatchDetailBatchSchema.parse({ matchIds, results });
  validateRawMatches(batch.results, rawMatches);
  const matches = [...rawMatches].sort((left, right) =>
    compareAsc(left.MatchInfo.StartTime, right.MatchInfo.StartTime),
  );
  const mappings = resolveMappings(matches, options.isManualSeries === true);
  const mappedResults = batch.results.map((result) =>
    result.status === "unavailable"
      ? result
      : {
          ...result,
          detail: mapDetailSeriesSides(result.detail, mappings?.matchTeamIdToSeriesTeamId.get(result.matchId)),
        },
  );
  const aggregation: SeriesDetailResponse["aggregation"] = batch.results.some(
    (result) => result.status === "unavailable",
  )
    ? { status: "unavailable", reason: "incomplete-matches" }
    : mappings == null
      ? { status: "unavailable", reason: "ambiguous-team-mapping" }
      : mapSeriesDetailAggregation(mapManualSeriesToStableTeams(matches, Preconditions.checkExists(mappings)), options);
  return seriesDetailContract.parse({
    seriesId,
    matches: { matchIds: batch.matchIds, results: mappedResults },
    aggregation,
    context: options.context,
  });
}
