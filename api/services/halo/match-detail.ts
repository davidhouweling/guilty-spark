import { parseISO } from "date-fns";
import { GameVariantCategory } from "halo-infinite-api";
import type { MatchStats } from "halo-infinite-api";
import { matchDetailSchema } from "@guilty-spark/shared/contracts/stats/detail";
import type { MatchDetail } from "@guilty-spark/shared/contracts/stats/detail";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { mapMatchDetailRosters } from "./match-detail-rosters";
import type { MatchDetailOptions } from "./types";

function mapScoreSection(
  match: MatchStats,
  options: MatchDetailOptions,
  metric: "score" | "rounds-won",
): NonNullable<MatchDetail["score"]["primary"]> {
  return {
    metric,
    teams: match.Teams.map((team) => ({
      matchTeamId: team.TeamId,
      seriesTeamId: options.matchTeamIdToSeriesTeamId?.get(team.TeamId) ?? null,
      value: metric === "rounds-won" ? team.Stats.CoreStats.RoundsWon : team.Stats.CoreStats.Score,
    })),
  };
}

function mapScore(match: MatchStats, options: MatchDetailOptions): MatchDetail["score"] {
  if (match.Teams.length === 0) {
    return { primary: null, secondary: null };
  }
  const score = mapScoreSection(match, options, "score");
  if (match.MatchInfo.GameVariantCategory === GameVariantCategory.MultiplayerOddball) {
    return { primary: mapScoreSection(match, options, "rounds-won"), secondary: score };
  }
  return { primary: score, secondary: null };
}

export function mapMatchDetail(match: MatchStats, options: MatchDetailOptions): MatchDetail {
  const info = match.MatchInfo;
  const rosters = mapMatchDetailRosters(match, options);
  return matchDetailSchema.parse({
    matchId: match.MatchId,
    startTime: parseISO(info.StartTime).toISOString(),
    endTime: parseISO(info.EndTime).toISOString(),
    durationSeconds: getDurationInSeconds(info.Duration),
    map: {
      assetId: info.MapVariant.AssetId,
      versionId: info.MapVariant.VersionId,
      name: options.mapName,
      thumbnailUrl: options.mapThumbnailUrl,
    },
    mode: {
      assetId: info.UgcGameVariant.AssetId,
      versionId: info.UgcGameVariant.VersionId,
      gameVariantCategory: info.GameVariantCategory,
      name: options.modeName,
    },
    isMatchmaking: info.Playlist != null,
    matchmakingPlaylist: info.Playlist?.AssetId ?? null,
    teamsEnabled: info.TeamsEnabled,
    teamScoringEnabled: info.TeamScoringEnabled,
    teamCount: rosters.teams.length,
    score: mapScore(match, options),
    plannedMapIndex: options.plannedMapIndex,
    ...rosters,
  });
}
