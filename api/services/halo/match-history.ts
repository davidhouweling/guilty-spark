import type {
  CondensedMatchHistoryEntry,
  CondensedMatchHistoryPage,
} from "@guilty-spark/shared/contracts/individual-tracker/match-history";
import {
  analyzeMatchGroupings,
  buildTeamRosterSignature,
  getMatchOutcomeLabel,
} from "@guilty-spark/shared/halo/match-enrichment";
import { buildTeams } from "@guilty-spark/shared/halo/match-history";
import { accumulateMatchStatsForPlayer } from "@guilty-spark/shared/individual-tracker/stats-highlights-compute";
import { GameVariantCategory } from "halo-infinite-api";
import type { MatchStats, PlayerMatchHistory } from "halo-infinite-api";

export interface MatchHistoryMappingInput {
  readonly match: PlayerMatchHistory;
  readonly detail: MatchStats | null;
  readonly mapName: string;
  readonly modeName: string;
  readonly mapThumbnailUrl: string;
  readonly matchmakingPlaylist: string | null;
}

function mapHistoryEntry(
  input: MatchHistoryMappingInput,
  xuid: string,
  gamertags: ReadonlyMap<string, string>,
): CondensedMatchHistoryEntry {
  const { match, mapName, modeName, mapThumbnailUrl, matchmakingPlaylist } = input;
  const detail = input.detail?.MatchId === match.MatchId ? input.detail : null;
  const info = match.MatchInfo;
  const isMatchmaking = info.Playlist != null;
  const contribution = detail == null ? undefined : accumulateMatchStatsForPlayer(undefined, detail, xuid);
  const trackedPlayerSummary =
    contribution == null
      ? null
      : {
          kills: contribution.kills,
          deaths: contribution.deaths,
          assists: contribution.assists,
          damageDealt: contribution.damageDealt,
          damageTaken: contribution.damageTaken,
        };
  return {
    matchId: match.MatchId,
    startTimeIso: info.StartTime,
    endTimeIso: info.EndTime,
    durationIso: info.Duration,
    mapAssetId: info.MapVariant.AssetId,
    mapVersionId: info.MapVariant.VersionId,
    modeAssetId: info.UgcGameVariant.AssetId,
    modeVersionId: info.UgcGameVariant.VersionId,
    gameVariantCategory: info.GameVariantCategory,
    mapName,
    modeName,
    mapThumbnailUrl,
    outcome: getMatchOutcomeLabel(match.Outcome),
    isMatchmaking,
    matchmakingPlaylist: isMatchmaking ? matchmakingPlaylist : null,
    category: isMatchmaking
      ? "matchmaking"
      : info.LifecycleMode === 0
        ? "local"
        : info.LifecycleMode === 1
          ? "custom"
          : "unknown",
    teams: buildTeams(detail, gamertags).map((team) => [...team]),
    teamRosterSignature: detail == null ? null : buildTeamRosterSignature(detail),
    teamCount: detail?.Teams.length ?? null,
    score:
      detail == null
        ? null
        : {
            scores: detail.Teams.map((team) => team.Stats.CoreStats.Score),
            roundsWon:
              detail.MatchInfo.GameVariantCategory === GameVariantCategory.MultiplayerOddball
                ? detail.Teams.map((team) => team.Stats.CoreStats.RoundsWon)
                : null,
          },
    trackedPlayerSummary,
    highlightContribution:
      contribution == null ? null : { ...contribution, totalLifeSpawns: contribution.totalLifeSpawns ?? 0 },
  };
}

export function mapCondensedMatchHistoryPage(
  inputs: readonly MatchHistoryMappingInput[],
  xuid: string,
  gamertags: ReadonlyMap<string, string>,
): CondensedMatchHistoryPage {
  const matches = inputs.map((input) => mapHistoryEntry(input, xuid, gamertags));
  return { matches, suggestedGroupings: analyzeMatchGroupings(matches) };
}
