import { compareDesc } from "date-fns";
import type { MatchDetail, SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { resolveSeriesTeamMapping } from "@guilty-spark/shared/halo/series-team-identity";
import type { MatchTeamRoster, SeriesTeamRoster } from "@guilty-spark/shared/halo/series-team-identity";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type { TeamColor } from "../../team-colors/team-colors";
import type { SeriesOverviewProps } from "../../series-overview/types";
import type { ViewerSeriesTab } from "./types";

function presentRosters(detail: MatchDetail | undefined): MatchTeamRoster[] {
  const rosters = new Map<number, Set<string>>();
  for (const player of detail?.players ?? []) {
    if (!player.participation.presentAtBeginning || player.lastMatchTeamId == null) {
      continue;
    }
    const roster = rosters.get(player.lastMatchTeamId) ?? new Set<string>();
    roster.add(unwrapXuid(player.playerId));
    rosters.set(player.lastMatchTeamId, roster);
  }
  return [...rosters].sort(([left], [right]) => left - right).map(([matchTeamId, xuids]) => ({ matchTeamId, xuids }));
}

function presentScoreTeamIds(series: ViewerSeriesTab, detail: MatchDetail, anchor: MatchDetail | undefined): number[] {
  const anchorRosters = presentRosters(anchor);
  const matchRosters = presentRosters(detail);
  const canonical = resolveSeriesTeamMapping(
    anchorRosters.map((roster) => ({ seriesTeamId: roster.matchTeamId, xuids: roster.xuids })),
    matchRosters,
  );
  const orderedIds = canonical?.map((entry) => entry.matchTeamId) ?? detail.teams.map((team) => team.matchTeamId);
  if (anchor == null || series.teams.length !== 2 || detail.teams.length !== 2) {
    return orderedIds;
  }
  const configured: SeriesTeamRoster[] = series.teams.map((team) => {
    const xuids = new Set(team.players.flatMap((player) => (player.xboxId == null ? [] : [unwrapXuid(player.xboxId)])));
    return { seriesTeamId: team.id, xuids, unidentifiedPlayerCount: team.players.length - xuids.size };
  });
  if (configured.some((roster) => roster.xuids.size === 0)) {
    return orderedIds;
  }
  const resolution = resolveSeriesTeamMapping(configured, matchRosters);
  const firstTeam = resolution?.find((entry) => entry.seriesTeamId === series.teams[0]?.id);
  return firstTeam?.matchTeamId === orderedIds[1] ? [...orderedIds].reverse() : orderedIds;
}

function presentScore(section: MatchDetail["score"]["primary"], teamIds: readonly number[]): string | null {
  if (section == null || section.teams.length === 0) {
    return null;
  }
  const scores = new Map(section.teams.map((team) => [team.matchTeamId, team.value]));
  return teamIds
    .flatMap((id) => {
      const score = scores.get(id);
      return score == null ? [] : [score.toLocaleString("en-US")];
    })
    .join(":");
}

function presentTeams(details: readonly MatchDetail[], colors: readonly TeamColor[]): SeriesOverviewProps["teams"] {
  const latest = [...details].sort((left, right) => compareDesc(left.endTime, right.endTime)).at(0);
  return [...(latest?.teams ?? [])]
    .sort((left, right) => (left.seriesTeamId ?? left.matchTeamId) - (right.seriesTeamId ?? right.matchTeamId))
    .map((team, index) => ({
      id: `loaded:${team.matchTeamId.toString()}`,
      name: team.name ?? getTeamName(team.matchTeamId),
      teamColorHex: getTeamColorOrDefault(colors[index]?.id, index).hex,
      players: (latest?.players ?? [])
        .filter(
          (player) =>
            player.playerType === 1 &&
            player.participation.presentAtBeginning &&
            player.teamStats.some((stats) => stats.matchTeamId === team.matchTeamId),
        )
        .map((player) => ({
          id: player.playerId,
          discordName: player.gamertag ?? "*Unknown*",
          gamertag: player.gamertag,
        })),
    }));
}

export function presentViewerSeriesOverview(
  series: ViewerSeriesTab,
  data: SeriesDetailResponse,
  colors: readonly TeamColor[],
): ViewerSeriesTab["seriesOverview"] {
  const resultsById = new Map(data.matches.results.map((result) => [result.matchId, result]));
  const details = data.matches.results.flatMap((result) => (result.status === "resolved" ? [result.detail] : []));
  const anchor = details.find((detail) => detail.matchId === series.matches[0]?.matchId);
  const loadedTeams = presentTeams(details, colors);
  return {
    ...series.seriesOverview,
    teams: series.teams.length === 0 && loadedTeams.length > 0 ? loadedTeams : series.seriesOverview.teams,
    matches: series.seriesOverview.matches.map((match) => {
      const result = resultsById.get(match.id);
      if (result == null) {
        return match;
      }
      if (result.status === "unavailable") {
        return { ...match, score: "Unavailable", subScore: null };
      }
      const { detail } = result;
      const orderedIds = presentScoreTeamIds(series, detail, anchor);
      return {
        ...match,
        mapBackgroundUrl:
          detail.map.thumbnailUrl == null || detail.map.thumbnailUrl === "data:,"
            ? match.mapBackgroundUrl
            : detail.map.thumbnailUrl,
        score: presentScore(detail.score.primary, orderedIds) ?? "Unavailable",
        subScore: presentScore(detail.score.secondary, orderedIds),
      };
    }),
  };
}
