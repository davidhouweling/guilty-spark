import { compareAsc, compareDesc, isValid, max, parseISO } from "date-fns";
import { MatchType, RequestError } from "halo-infinite-api";
import type { MatchStats, PlayerMatchHistory } from "halo-infinite-api";
import type { OverlayPreviewMode } from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type {
  TrackerMatchSummary,
  TrackerSeriesTeam,
  TrackerViewState,
} from "@guilty-spark/shared/contracts/individual-tracker/view";
import type {
  StreamerViewSettings,
  IndividualStatsHighlightOption,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import {
  analyzeMatchGroupings,
  buildMatchScore,
  buildTeamRosterSignature,
  computeTrackedPlayerSummaryStats,
  getMatchOutcomeLabel,
} from "@guilty-spark/shared/halo/match-enrichment";
import type { NormalizedMatchOutcome } from "@guilty-spark/shared/halo/match-enrichment";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import {
  accumulateMatchStatsForPlayer,
  computeStatsHighlightItems,
} from "@guilty-spark/shared/individual-tracker/stats-highlights-compute";
import type { StatsHighlightAccumulatedTotals } from "@guilty-spark/shared/individual-tracker/stats-highlights-compute";
import type { HaloService } from "../services/halo/halo";
import type { LogService } from "../services/log/types";

/** Shared demo identity shown to signed-out visitors, surfaced via `isExample` in the response. */
export const OVERLAY_PREVIEW_DEMO_GAMERTAG = "soundmanD";
export const OVERLAY_PREVIEW_DEMO_XUID = "2533274844642438";

const PREVIEW_MATCH_COUNT = 15;
const PREVIEW_SERIES_ID = "overlay-preview-series";
const STATS_DISPLAY_LOCALE = "en-US";

export interface BuildOverlayPreviewViewOptions {
  readonly haloService: HaloService;
  readonly logService: LogService;
  readonly xuid: string;
  readonly gamertag: string;
  readonly mode: OverlayPreviewMode;
  readonly statsHighlightSlots: readonly IndividualStatsHighlightOption[];
  readonly streamerSettings?: StreamerViewSettings | undefined;
}

interface ResolvedPreviewMatch {
  readonly summary: TrackerMatchSummary;
  readonly stats: MatchStats;
  readonly outcome: NormalizedMatchOutcome;
}

function isMatchmakingMatch(match: PlayerMatchHistory): boolean {
  return match.MatchInfo.Playlist != null;
}

function parsePreviewTime(value: string): Date {
  const date = parseISO(value);
  if (!isValid(date)) {
    throw new Error(`Invalid preview match timestamp: ${value}`);
  }
  return date;
}

function isPreviewAuthError(error: unknown): boolean {
  if (error instanceof RequestError) {
    return error.response.status === 401;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /\b401\b|unauthorized|expired|spartan token/i.test(message);
}

async function resolvePlaylistName(
  haloService: HaloService,
  logService: LogService,
  playlist: PlayerMatchHistory["MatchInfo"]["Playlist"],
): Promise<string | null> {
  if (playlist == null) {
    return null;
  }
  try {
    const name = await haloService.getPlaylistName(playlist.AssetId, playlist.VersionId);
    return name === "" ? null : name;
  } catch (error) {
    if (isPreviewAuthError(error)) {
      throw error;
    }
    logService.warn(error, new Map([["context", "Overlay preview: getPlaylistName failed"]]));
    return null;
  }
}

async function toPreviewMatch(
  haloService: HaloService,
  logService: LogService,
  match: PlayerMatchHistory,
  stats: MatchStats,
  xuid: string,
): Promise<ResolvedPreviewMatch> {
  const [{ gameMap }, mapBackgroundUrl, matchmakingPlaylist] = await Promise.all([
    haloService.getGameTypeAndMapParts(match.MatchInfo),
    haloService.getMapThumbnailUrl(match.MatchInfo.MapVariant.AssetId, match.MatchInfo.MapVariant.VersionId),
    resolvePlaylistName(haloService, logService, match.MatchInfo.Playlist),
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
    if (player.PlayerType !== 1 || !player.ParticipationInfo.PresentAtBeginning) {
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
    return [];
  }

  const latest = candidates
    .map((grouping) => ({
      grouping,
      endedAt: max(grouping.map((entry) => parsePreviewTime(entry.summary.endTime))),
    }))
    .sort((left, right) => compareDesc(left.endedAt, right.endedAt))
    .at(0);

  return latest?.grouping ?? [];
}

async function buildStatsHighlights(
  resolved: readonly ResolvedPreviewMatch[],
  xuid: string,
  statsHighlightSlots: readonly IndividualStatsHighlightOption[],
  haloService: HaloService,
  logService: LogService,
): Promise<TrackerViewState["statsHighlights"]> {
  let totals: StatsHighlightAccumulatedTotals | undefined;
  for (const entry of resolved) {
    totals = accumulateMatchStatsForPlayer(totals, entry.stats, xuid) ?? totals;
  }

  const needsRank = statsHighlightSlots.some(
    (slot) => slot === "current-rank" || slot === "season-peak" || slot === "all-time-peak",
  );
  const needsEsra = statsHighlightSlots.includes("esra");
  const [csrResult, esraResult] = await Promise.allSettled([
    needsRank ? haloService.getRankedArenaCsrs([xuid]) : Promise.resolve(null),
    needsEsra ? haloService.getPlayerEsra(xuid) : Promise.resolve(null),
  ]);
  if (csrResult.status === "rejected") {
    logService.warn(csrResult.reason, new Map([["context", "Overlay preview: getRankedArenaCsrs failed"]]));
  }
  if (esraResult.status === "rejected") {
    logService.warn(esraResult.reason, new Map([["context", "Overlay preview: getPlayerEsra failed"]]));
  }
  const csr = csrResult.status === "fulfilled" ? (csrResult.value?.get(xuid) ?? null) : null;
  const esra = esraResult.status === "fulfilled" ? esraResult.value : null;

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
      csr,
      esra,
    ),
  ];
}

async function resolveHistory(
  haloService: HaloService,
  logService: LogService,
  xuid: string,
  mode: OverlayPreviewMode,
): Promise<ResolvedPreviewMatch[]> {
  const matchType = mode === "series" ? MatchType.Custom : MatchType.All;
  const history = (await haloService.getPlayerMatches(xuid, matchType, PREVIEW_MATCH_COUNT)).filter(
    (match) => getDurationInSeconds(match.MatchInfo.Duration) >= 120,
  );
  if (history.length === 0) {
    return [];
  }

  const details = await haloService.getMatchDetails(history.map((match) => match.MatchId));
  const detailsById = new Map(details.map((match) => [match.MatchId, match]));

  const resolved = await Promise.all(
    history.map(async (match) => {
      const stats = detailsById.get(match.MatchId);
      return stats == null ? null : await toPreviewMatch(haloService, logService, match, stats, xuid);
    }),
  );

  return resolved
    .filter((entry): entry is ResolvedPreviewMatch => entry !== null)
    .sort((left, right) =>
      compareAsc(parsePreviewTime(left.summary.startTime), parsePreviewTime(right.summary.startTime)),
    );
}

/**
 * Builds a tracker view for the overlay setup preview from real match history, using the same
 * enrichment helpers the tracker DO uses so the preview matches production rendering.
 */
export async function buildOverlayPreviewView(options: BuildOverlayPreviewViewOptions): Promise<TrackerViewState> {
  const { haloService, logService, xuid, gamertag, mode, statsHighlightSlots, streamerSettings } = options;
  const resolved = await resolveHistory(haloService, logService, xuid, mode);
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
      statsHighlights: await buildStatsHighlights(resolved, xuid, statsHighlightSlots, haloService, logService),
    };
  }

  const seriesMatches = selectLatestSeries(resolved);
  if (seriesMatches.length === 0) {
    return { ...base, matches: [], series: [], hasActiveSeries: false };
  }

  const xuidToGamertag = await haloService.getPlayerXuidsToGametags(seriesMatches.map((entry) => entry.stats));
  const first = Preconditions.checkExists(seriesMatches.at(0), "Series preview requires at least one match");
  const teams = buildSeriesTeams(first.stats, xuidToGamertag);
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
