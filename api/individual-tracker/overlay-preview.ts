import { MatchType } from "halo-infinite-api";
import type { MatchStats, PlayerMatchHistory } from "halo-infinite-api";
import type { OverlayPreviewMode } from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type {
  TrackerMatchSummary,
  TrackerSeriesTeam,
  TrackerViewState,
} from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { IndividualStatsHighlightOption } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import {
  analyzeMatchGroupings,
  buildMatchScore,
  buildTeamRosterSignature,
  computeTrackedPlayerSummaryStats,
  getMatchOutcomeLabel,
} from "@guilty-spark/shared/halo/match-enrichment";
import type { NormalizedMatchOutcome } from "@guilty-spark/shared/halo/match-enrichment";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import {
  accumulateMatchStatsForPlayer,
  computeStatsHighlightItems,
} from "@guilty-spark/shared/individual-tracker/stats-highlights-compute";
import type { StatsHighlightAccumulatedTotals } from "@guilty-spark/shared/individual-tracker/stats-highlights-compute";
import type { HaloService } from "../services/halo/halo";

/** Shared demo identity shown to signed-out visitors, surfaced via `isExample` in the response. */
export const OVERLAY_PREVIEW_DEMO_GAMERTAG = "soundmanD";
export const OVERLAY_PREVIEW_DEMO_XUID = "2533274844642438";

const PREVIEW_MATCH_COUNT = 15;
const PREVIEW_SERIES_ID = "overlay-preview-series";
const STATS_DISPLAY_LOCALE = "en-US";

export interface BuildOverlayPreviewViewOptions {
  readonly haloService: HaloService;
  readonly xuid: string;
  readonly gamertag: string;
  readonly mode: OverlayPreviewMode;
  readonly statsHighlightSlots: readonly IndividualStatsHighlightOption[];
  readonly streamerSettings?: StreamerViewSettings;
}

interface ResolvedPreviewMatch {
  readonly summary: TrackerMatchSummary;
  readonly stats: MatchStats;
  readonly outcome: NormalizedMatchOutcome;
}

function isMatchmakingMatch(match: PlayerMatchHistory): boolean {
  return match.MatchInfo.Playlist != null;
}

async function toPreviewMatch(
  haloService: HaloService,
  match: PlayerMatchHistory,
  stats: MatchStats,
  xuid: string,
): Promise<ResolvedPreviewMatch> {
  const [{ gameMap }, mapBackgroundUrl, matchmakingPlaylist] = await Promise.all([
    haloService.getGameTypeAndMapParts(match.MatchInfo),
    haloService.getMapThumbnailUrl(match.MatchInfo.MapVariant.AssetId, match.MatchInfo.MapVariant.VersionId),
    match.MatchInfo.Playlist != null
      ? haloService.getPlaylistName(match.MatchInfo.Playlist.AssetId, match.MatchInfo.Playlist.VersionId)
      : Promise.resolve(null),
  ]);

  const trackedStats = computeTrackedPlayerSummaryStats(stats, xuid);
  const outcome = getMatchOutcomeLabel(match.Outcome);

  return {
    stats,
    outcome,
    summary: {
      matchId: match.MatchId,
      startTime: match.MatchInfo.StartTime,
      endTime: match.MatchInfo.EndTime,
      mapAssetId: match.MatchInfo.MapVariant.AssetId,
      mapVersionId: match.MatchInfo.MapVariant.VersionId,
      mapName: gameMap,
      modeAssetId: match.MatchInfo.UgcGameVariant.AssetId,
      gameVariantCategory: match.MatchInfo.GameVariantCategory,
      ...(mapBackgroundUrl != null ? { mapBackgroundUrl } : {}),
      outcome,
      score: buildMatchScore(stats, STATS_DISPLAY_LOCALE),
      teamCount: stats.Teams.length,
      killsDeathsAssistsKda: trackedStats.killsDeathsAssistsKda,
      damageDealtTakenRatio: trackedStats.damageDealtTakenRatio,
      isMatchmaking: isMatchmakingMatch(match),
      ...(matchmakingPlaylist != null ? { matchmakingPlaylist } : {}),
    },
  };
}

function buildSeriesTeams(stats: MatchStats, xuidToGamertag: ReadonlyMap<string, string>): TrackerSeriesTeam[] {
  const playersByTeam = new Map<number, string[]>();

  for (const player of stats.Players) {
    if (player.PlayerType !== 1) {
      continue;
    }
    const playerXuid = getPlayerXuid(player);
    const entries = playersByTeam.get(player.LastTeamId) ?? [];
    entries.push(xuidToGamertag.get(playerXuid) ?? "*Unknown*");
    playersByTeam.set(player.LastTeamId, entries);
  }

  return [...playersByTeam.entries()]
    .sort(([left], [right]) => left - right)
    .map(([teamId, gamertags]) => ({
      id: teamId,
      name: getTeamName(teamId),
      players: gamertags.map((gamertag) => ({
        discordId: null,
        discordName: null,
        gamertag,
        xboxId: null,
      })),
    }));
}

/** Picks the most recently completed grouped custom series from the resolved history. */
function selectLatestSeries(resolved: readonly ResolvedPreviewMatch[]): readonly ResolvedPreviewMatch[] {
  const byMatchId = new Map(resolved.map((entry) => [entry.summary.matchId, entry]));
  const groupings = analyzeMatchGroupings(
    resolved.map((entry) => ({
      matchId: entry.summary.matchId,
      isMatchmaking: entry.summary.isMatchmaking,
      teamRosterSignature: buildTeamRosterSignature(entry.stats),
    })),
  );

  const candidates = groupings
    .map((grouping) => grouping.map((matchId) => byMatchId.get(matchId)).filter((entry) => entry !== undefined))
    .filter((grouping) => grouping.length > 0);

  if (candidates.length === 0) {
    return resolved.filter((entry) => !entry.summary.isMatchmaking);
  }

  const latest = candidates
    .map((grouping) => ({
      grouping,
      endedAt: Math.max(...grouping.map((entry) => Date.parse(entry.summary.endTime))),
    }))
    .sort((left, right) => right.endedAt - left.endedAt)
    .at(0);

  return latest?.grouping ?? [];
}

function buildStatsHighlights(
  resolved: readonly ResolvedPreviewMatch[],
  xuid: string,
  statsHighlightSlots: readonly IndividualStatsHighlightOption[],
): TrackerViewState["statsHighlights"] {
  let totals: StatsHighlightAccumulatedTotals | undefined;
  for (const entry of resolved) {
    totals = accumulateMatchStatsForPlayer(totals, entry.stats, xuid) ?? totals;
  }

  return [
    ...computeStatsHighlightItems(
      {
        matches: resolved.map((entry) => ({
          matchId: entry.summary.matchId,
          isMatchmaking: entry.summary.isMatchmaking,
          teamRosterSignature: buildTeamRosterSignature(entry.stats),
          outcome: entry.outcome,
          startTime: entry.summary.startTime,
        })),
        totals,
      },
      statsHighlightSlots,
    ),
  ];
}

async function resolveHistory(
  haloService: HaloService,
  xuid: string,
  mode: OverlayPreviewMode,
): Promise<ResolvedPreviewMatch[]> {
  const matchType = mode === "series" ? MatchType.Custom : MatchType.All;
  const history = await haloService.getPlayerMatches(xuid, matchType, PREVIEW_MATCH_COUNT);
  if (history.length === 0) {
    return [];
  }

  const details = await haloService.getMatchDetails(history.map((match) => match.MatchId));
  const detailsById = new Map(details.map((match) => [match.MatchId, match]));

  const resolved = await Promise.all(
    history.map(async (match) => {
      const stats = detailsById.get(match.MatchId);
      return stats == null ? null : await toPreviewMatch(haloService, match, stats, xuid);
    }),
  );

  return resolved
    .filter((entry): entry is ResolvedPreviewMatch => entry !== null)
    .sort((left, right) => Date.parse(left.summary.startTime) - Date.parse(right.summary.startTime));
}

/**
 * Builds a tracker view for the overlay setup preview from real match history, using the same
 * enrichment helpers the tracker DO uses so the preview matches production rendering.
 */
export async function buildOverlayPreviewView(options: BuildOverlayPreviewViewOptions): Promise<TrackerViewState> {
  const { haloService, xuid, gamertag, mode, statsHighlightSlots, streamerSettings } = options;
  const resolved = await resolveHistory(haloService, xuid, mode);
  const now = new Date().toISOString();

  const base = {
    trackerId: `overlay-preview-${mode}`,
    gamertag,
    status: "active",
    isLive: true,
    lastUpdateTime: now,
    lastMatchDiscoveredAt: resolved.at(-1)?.summary.endTime ?? null,
    hasRecentCompletedSeries: false,
    ...(streamerSettings !== undefined ? { streamerSettings } : {}),
  } satisfies Partial<TrackerViewState>;

  if (mode === "matchmaking") {
    return {
      ...base,
      matches: resolved.map((entry) => entry.summary),
      series: [],
      hasActiveSeries: false,
      statsHighlights: buildStatsHighlights(resolved, xuid, statsHighlightSlots),
    };
  }

  const seriesMatches = selectLatestSeries(resolved);
  if (seriesMatches.length === 0) {
    return { ...base, matches: [], series: [], hasActiveSeries: false };
  }

  const xuidToGamertag = await haloService.getPlayerXuidsToGametags(seriesMatches.map((entry) => entry.stats));
  const anchor = Preconditions.checkExists(seriesMatches.at(-1), "Series preview requires at least one match");
  const first = Preconditions.checkExists(seriesMatches.at(0), "Series preview requires at least one match");
  const teams = buildSeriesTeams(anchor.stats, xuidToGamertag);
  const title = `${gamertag} series`;
  const subtitle = `${seriesMatches.length.toString()} games`;

  return {
    ...base,
    matches: seriesMatches.map((entry) => entry.summary),
    series: [
      {
        id: PREVIEW_SERIES_ID,
        matchIds: seriesMatches.map((entry) => entry.summary.matchId),
        score: haloService.getSeriesScore(
          seriesMatches.map((entry) => entry.stats),
          STATS_DISPLAY_LOCALE,
        ),
        title,
        subtitle,
        guildIconUrl: null,
        teams,
      },
    ],
    hasActiveSeries: true,
    activeSeriesContext: {
      title,
      subtitle,
      guildIconUrl: null,
      startedAt: first.summary.startTime,
      teams,
    },
  };
}
