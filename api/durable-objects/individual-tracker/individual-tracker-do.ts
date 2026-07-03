import * as Sentry from "@sentry/cloudflare";
import { addMilliseconds, compareAsc, differenceInHours } from "date-fns";
import { z } from "zod";
import {
  type PlayerMatchHistory,
  type MatchStats,
  MatchType,
  type PlaylistCsrContainer,
  RequestError,
} from "halo-infinite-api";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { trackerViewMessageContract } from "@guilty-spark/shared/contracts/individual-tracker/view";
import {
  editSeriesContract,
  editSeriesRequestSchema,
  endSeriesContract,
  resumeSeriesContract,
  selectMatchesContract,
  selectMatchesRequestSchema,
  startSeriesContract,
  startSeriesRequestSchema,
} from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import {
  individualTrackerPauseContract,
  individualTrackerResumeContract,
  individualTrackerStartContract,
  individualTrackerStartRequestSchema,
  individualTrackerStopContract,
  type IndividualTrackerDoState,
} from "@guilty-spark/shared/contracts/durable-objects/individual-tracker/lifecycle";
import {
  individualTrackerStatusContract,
  individualTrackerRefreshContract,
  individualTrackerViewStateContract,
} from "@guilty-spark/shared/contracts/durable-objects/individual-tracker/management";
import {
  individualTrackerNudgeContract,
  nudgePayloadSchema,
  type SeriesSubstitutedPayload,
} from "@guilty-spark/shared/contracts/durable-objects/individual-tracker/nudge";
import {
  analyzeMatchGroupings,
  buildMatchScore,
  buildTeamRosterSignature,
  getMatchOutcomeLabel,
} from "@guilty-spark/shared/halo/match-enrichment";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import { computeSeriesTeamWins } from "@guilty-spark/shared/halo/series-score";
import {
  buildSeriesGroupKey,
  getDefaultSeriesGroupSubtitle,
  getDefaultSeriesGroupTitle,
} from "@guilty-spark/shared/individual-tracker/series-grouping";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { parseJsonBody } from "@guilty-spark/shared/base/request-parsing";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import {
  INDIVIDUAL_STATS_HIGHLIGHTS_MAX_SLOT_COUNT,
  INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTIONS,
  type IndividualStatsHighlightOption,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { HaloService } from "../../services/halo/halo";
import type { PlayerEsraData } from "../../services/halo/types";
import type { JsonAny, LogService } from "../../services/log/types";
import { installServices as installServicesImpl, type Services } from "../../services/install";
import {
  CloudflareWebSocketHibernationAdapter,
  type WebSocketHibernationAdapter,
} from "../../base/websocket-hibernation-adapter";
import type {
  IndividualTrackerInternalState,
  IndividualTrackerMatchSummary,
  IndividualTrackerSeriesGroup,
  IndividualTrackerSeriesGroupOverride,
  IndividualTrackerViewState,
  PreSeriesPlayerInfo,
  ActiveSeries,
  SeriesPlayer,
  SeriesTeam,
  StatsHighlightItem,
} from "./types";
import { accumulatePlayerStats, computeStatsHighlights, getActiveMatchIds } from "./stats-highlights";

const DISPLAY_INTERVAL_MS = 3 * 60 * 1000;
const EXECUTION_BUFFER_MS = 8 * 1000;
const ALARM_INTERVAL_MS = DISPLAY_INTERVAL_MS - EXECUTION_BUFFER_MS;

const NORMAL_INTERVAL_MINUTES = 3;
const CONSECUTIVE_ERROR_INTERVAL_MINUTES = 5;
const MAX_BACKOFF_INTERVAL_MINUTES = 10;

const PLAYER_MATCHES_PAGE_SIZE = 25;
const MAX_MATCHES_TO_FETCH = 100;

const STATE_STORAGE_KEY = "individualTrackerState";

const individualStatsHighlightOptionSet = new Set<string>(INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTIONS);

function isIndividualStatsHighlightOption(value: string): value is IndividualStatsHighlightOption {
  return individualStatsHighlightOptionSet.has(value);
}

const statsHighlightSlotsQuerySchema = z.object({
  statsHighlightSlots: z.string().optional(),
});

const statsHighlightSlotsPayloadSchema = z
  .preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    try {
      return JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }, z.array(z.string()).optional())
  .transform((slots): readonly IndividualStatsHighlightOption[] =>
    (slots ?? []).filter(isIndividualStatsHighlightOption).slice(0, INDIVIDUAL_STATS_HIGHLIGHTS_MAX_SLOT_COUNT),
  );

function parseStatsHighlightSlots(url: URL): readonly IndividualStatsHighlightOption[] {
  const parsedQuery = statsHighlightSlotsQuerySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsedQuery.success) {
    return [];
  }

  const rawSlots = parsedQuery.data.statsHighlightSlots;
  if (rawSlots == null) {
    return [];
  }

  const parsedSlots = statsHighlightSlotsPayloadSchema.safeParse(rawSlots);
  if (!parsedSlots.success) {
    return [];
  }

  return parsedSlots.data;
}

function normalizeRankTier(rankTier: string | null | undefined): string | null {
  if (rankTier == null || rankTier === "") {
    return null;
  }

  return rankTier;
}

export class IndividualTrackerDO implements DurableObject, Rpc.DurableObjectBranded {
  __DURABLE_OBJECT_BRAND = undefined as never;
  private readonly state: DurableObjectState;
  private readonly env: Env;
  private readonly services: Services;
  private readonly logService: LogService;
  private readonly webSocketAdapter: WebSocketHibernationAdapter;
  private userHaloService: HaloService | null = null;
  private userHaloServiceUserId: string | null = null;
  private statsHighlightsCacheKey: string | undefined;
  private cachedStatsHighlights: readonly StatsHighlightItem[] | undefined;
  private cachedResolvedRosterCount: number | undefined;

  constructor(
    state: DurableObjectState,
    env: Env,
    installServices = installServicesImpl,
    webSocketAdapter: WebSocketHibernationAdapter = new CloudflareWebSocketHibernationAdapter(),
  ) {
    this.state = state;
    this.env = env;

    this.services = installServices({ env });
    this.logService = this.services.logService;
    this.webSocketAdapter = webSocketAdapter;
  }

  async fetch(request: Request): Promise<Response> {
    return await Sentry.withScope(async () => {
      const url = new URL(request.url);
      const action = url.pathname.split("/").pop();

      Sentry.setTag("durableObject", "IndividualTrackerDO");
      Sentry.setTag("action", action ?? "unknown");
      Sentry.setContext("request", {
        url: request.url,
        method: request.method,
      });

      this.logService.debug("IndividualTrackerDO: fetch", new Map([["action", action ?? "unknown"]]));

      try {
        switch (action) {
          case "start": {
            return await this.handleStart(request);
          }
          case "pause": {
            return await this.handlePause();
          }
          case "resume": {
            return await this.handleResume();
          }
          case "stop": {
            return await this.handleStop();
          }
          case "status": {
            return await this.handleStatus();
          }
          case "view-state": {
            return await this.handleViewState(request);
          }
          case "select-matches": {
            return await this.handleSelectMatches(request);
          }
          case "start-series": {
            return await this.handleStartSeries(request);
          }
          case "end-series": {
            return await this.handleEndSeries();
          }
          case "edit-series": {
            return await this.handleEditSeries(request);
          }
          case "resume-series": {
            return await this.handleResumeSeries();
          }
          case "refresh": {
            return await this.handleRefresh();
          }
          case "nudge": {
            return await this.handleNudge(request);
          }
          case "websocket": {
            return await this.handleWebSocket(request);
          }
          case undefined: {
            return new Response("Bad Request", { status: 400 });
          }
          default: {
            return new Response("Not Found", { status: 404 });
          }
        }
      } catch (error) {
        this.logService.error(
          error,
          new Map([
            ["context", "IndividualTrackerDO fetch error"],
            ["action", action ?? "unknown"],
            ["url", url.pathname],
          ]),
        );
        return new Response("Internal Server Error", { status: 500 });
      }
    });
  }

  async alarm(): Promise<void> {
    await Sentry.withScope(async () => {
      Sentry.setTag("durableObject", "IndividualTrackerDO");
      Sentry.setTag("method", "alarm");

      const trackerState = await this.getState();
      if (trackerState == null || trackerState.isPaused || trackerState.status !== "active") {
        return;
      }

      Sentry.setContext("trackerState", {
        userId: trackerState.userId,
        trackerId: trackerState.trackerId,
        gamertag: trackerState.gamertag,
        checkCount: trackerState.checkCount,
        errorCount: trackerState.errorState.consecutiveErrors,
      });

      const lastActivity = new Date(
        Math.max(
          new Date(trackerState.startTime).getTime(),
          trackerState.lastMatchDiscoveredAt == null
            ? new Date(trackerState.startTime).getTime()
            : new Date(trackerState.lastMatchDiscoveredAt).getTime(),
        ),
      );

      this.logService.info(
        "IndividualTracker: alarm triggered",
        new Map<string, JsonAny>([
          ["trackerId", trackerState.trackerId],
          ["gamertag", trackerState.gamertag],
          ["checkCount", trackerState.checkCount],
          ["consecutiveErrors", trackerState.errorState.consecutiveErrors],
          ["lastActivity", lastActivity.toISOString()],
        ]),
      );
      if (differenceInHours(new Date(), lastActivity) >= trackerState.idleTimeoutHours) {
        this.logService.info(
          "IndividualTracker: idle timeout reached, stopping tracker",
          new Map<string, JsonAny>([
            ["trackerId", trackerState.trackerId],
            ["gamertag", trackerState.gamertag],
            ["idleTimeoutHours", trackerState.idleTimeoutHours],
          ]),
        );
        trackerState.status = "stopped";
        trackerState.lastUpdateTime = new Date().toISOString();
        await this.state.storage.deleteAlarm();
        await this.setState(trackerState);
        this.notifyUserTracker(trackerState);
        this.broadcastViewState(trackerState);
        this.closeWebSockets("Tracker idle timeout");
        await this.markRegistryStopped(trackerState);
        return;
      }

      await this.pollAndPersist(trackerState, false, "IndividualTracker alarm poll failed");
    });
  }

  private async pollAndPersist(
    trackerState: IndividualTrackerInternalState,
    broadcastWhenUnchanged: boolean,
    errorContext: string,
  ): Promise<void> {
    let discoveredNewMatch = false;
    try {
      discoveredNewMatch = await this.pollWithMarker(trackerState);
    } catch (error) {
      this.logService.error(error, new Map([["context", errorContext]]));
      this.handleError(trackerState, error);
    }

    await this.setState(trackerState);
    this.notifyUserTracker(trackerState);
    if (broadcastWhenUnchanged || discoveredNewMatch) {
      this.broadcastViewState(trackerState);
    }
    await this.state.storage.setAlarm(addMilliseconds(new Date(), this.getNextAlarmInterval(trackerState)).getTime());
  }

  private async pollWithMarker(trackerState: IndividualTrackerInternalState): Promise<boolean> {
    this.logService.info(
      "IndividualTracker: polling for new matches with marker strategy",
      new Map([
        ["trackerId", trackerState.trackerId],
        ["gamertag", trackerState.gamertag],
        ["lastSeenMatchId", trackerState.lastSeenMatchId ?? "none"],
      ]),
    );

    await this.getUserHaloService(trackerState.userId);
    const { allMatches, markerFound, markerFoundAtIndex } = await this.fetchPlayerMatchesPagesWithMarker(trackerState);

    let discoveredNewMatch = false;
    let viewChanged = false;
    const newlyDiscovered = new Set<string>();
    const searchStart = new Date(trackerState.searchStartTime);
    const strategy = markerFound ? "marker" : trackerState.lastSeenMatchId != null ? "fallback" : "initial";
    const matchesToProcess = this.getMatchesToProcessBeforeMarker(allMatches, markerFound, markerFoundAtIndex);
    const matchesToProcessInTimeOrder = [...matchesToProcess].reverse();
    const knownIds = new Set(trackerState.matchIds);
    const existingActiveSeriesMatchIds = new Set(trackerState.activeSeries?.matchIds ?? []);

    let skippedAlreadyKnown = 0;
    let skippedBeforeStart = 0;

    for (const match of matchesToProcessInTimeOrder) {
      const matchId = match.MatchId;

      if (knownIds.has(matchId)) {
        skippedAlreadyKnown++;
        continue;
      }

      if (new Date(match.MatchInfo.StartTime) < searchStart) {
        skippedBeforeStart++;
        continue;
      }

      const isMatchmakingMatch = match.MatchInfo.Playlist != null;
      if (trackerState.activeSeries != null && isMatchmakingMatch) {
        this.retireActiveSeries(trackerState);
        this.logService.info(
          "IndividualTracker: series ended after matchmaking match was discovered",
          new Map([
            ["trackerId", trackerState.trackerId],
            ["gamertag", trackerState.gamertag],
            ["matchId", matchId],
          ]),
        );
      }

      const outcome = getMatchOutcomeLabel(match.Outcome);
      const mapName = await this.resolveMapName(
        match.MatchInfo.MapVariant.AssetId,
        match.MatchInfo.MapVariant.VersionId,
      );
      const mapBackgroundUrl = await this.resolveMapBackgroundUrl(
        match.MatchInfo.MapVariant.AssetId,
        match.MatchInfo.MapVariant.VersionId,
      );
      const summary: IndividualTrackerMatchSummary = {
        matchId,
        startTime: match.MatchInfo.StartTime,
        endTime: match.MatchInfo.EndTime,
        mapAssetId: match.MatchInfo.MapVariant.AssetId,
        mapVersionId: match.MatchInfo.MapVariant.VersionId,
        mapName,
        mapBackgroundUrl,
        modeAssetId: match.MatchInfo.UgcGameVariant.AssetId,
        gameVariantCategory: match.MatchInfo.GameVariantCategory,
        outcome,
        score: "",
        isMatchmaking: isMatchmakingMatch,
        teamRosterSignature: null,
        teamOutcomes: null,
      };
      await this.enrichScore(summary);
      trackerState.discoveredMatches[matchId] = summary;
      trackerState.matchIds.push(matchId);
      knownIds.add(matchId);
      const durationSeconds = getDurationInSeconds(match.MatchInfo.Duration);
      if (durationSeconds >= 120) {
        trackerState.selectedMatchIds.push(matchId);
      }
      if (trackerState.activeSeries != null && !isMatchmakingMatch && !existingActiveSeriesMatchIds.has(matchId)) {
        trackerState.activeSeries.matchIds.push(matchId);
        existingActiveSeriesMatchIds.add(matchId);
      }
      newlyDiscovered.add(matchId);
      discoveredNewMatch = true;
      this.logService.info(
        "IndividualTracker: added new match to tracker",
        new Map([
          ["trackerId", trackerState.trackerId],
          ["gamertag", trackerState.gamertag],
          ["matchId", matchId],
          ["mapName", summary.mapName],
          ["score", summary.score],
        ]),
      );
    }

    if (newlyDiscovered.size > 0) {
      trackerState.selectedMatchIds = trackerState.selectedMatchIds.sort();
    }

    this.logService.info(
      "IndividualTracker: poll marker filter summary",
      new Map<string, JsonAny>([
        ["trackerId", trackerState.trackerId],
        ["gamertag", trackerState.gamertag],
        ["strategy", strategy],
        ["totalFetched", allMatches.length],
        ["processedRange", matchesToProcess.length],
        ["skippedAlreadyKnown", skippedAlreadyKnown],
        ["skippedBeforeStart", skippedBeforeStart],
        ["newlyDiscovered", newlyDiscovered.size],
      ]),
    );

    this.updateLastSeenMatchIdMarker(trackerState, allMatches);

    for (const matchId of trackerState.matchIds) {
      if (newlyDiscovered.has(matchId)) {
        continue;
      }
      const summary = trackerState.discoveredMatches[matchId];
      if (summary == null) {
        continue;
      }

      if (summary.teamOutcomes === null) {
        const enriched = await this.enrichScore(summary);
        if (enriched) {
          viewChanged = true;
        }
      }

      if (summary.mapName === "") {
        const mapName = await this.resolveMapName(summary.mapAssetId, summary.mapVersionId);
        if (mapName !== "") {
          summary.mapName = mapName;
          viewChanged = true;
        }
      }

      if (summary.mapBackgroundUrl === "") {
        const mapBackgroundUrl = await this.resolveMapBackgroundUrl(summary.mapAssetId, summary.mapVersionId);
        if (mapBackgroundUrl !== "") {
          summary.mapBackgroundUrl = mapBackgroundUrl;
          viewChanged = true;
        }
      }
    }

    const now = new Date().toISOString();
    if (discoveredNewMatch) {
      trackerState.lastMatchDiscoveredAt = now;
    }
    if (viewChanged) {
      discoveredNewMatch = true;
    }

    await this.recomputeAccumulatedTotals(trackerState);

    trackerState.checkCount += 1;
    trackerState.lastUpdateTime = now;
    trackerState.lastSuccessfulFetch = now;
    trackerState.errorState.consecutiveErrors = 0;
    trackerState.errorState.backoffMinutes = NORMAL_INTERVAL_MINUTES;
    trackerState.errorState.lastSuccessTime = now;
    trackerState.errorState.lastErrorMessage = undefined;

    this.logService.info(
      "IndividualTracker: poll with marker complete",
      new Map<string, JsonAny>([
        ["trackerId", trackerState.trackerId],
        ["gamertag", trackerState.gamertag],
        ["newMatches", newlyDiscovered.size],
        ["totalMatches", trackerState.matchIds.length],
        ["checkCount", trackerState.checkCount],
      ]),
    );

    return discoveredNewMatch;
  }

  private async fetchPlayerMatchesPagesWithMarker(trackerState: IndividualTrackerInternalState): Promise<{
    allMatches: PlayerMatchHistory[];
    markerFound: boolean;
    markerFoundAtIndex: number;
  }> {
    const allMatches: PlayerMatchHistory[] = [];
    let markerFound = false;
    let markerFoundAtIndex = -1;
    const maxPages = Math.ceil(MAX_MATCHES_TO_FETCH / PLAYER_MATCHES_PAGE_SIZE);

    for (let page = 0; page < maxPages; page++) {
      const start = page * PLAYER_MATCHES_PAGE_SIZE;
      try {
        const pageMatches = await this.haloService.getPlayerMatches(
          trackerState.xuid,
          MatchType.All,
          PLAYER_MATCHES_PAGE_SIZE,
          start,
        );

        if (pageMatches.length === 0) {
          break;
        }

        allMatches.push(...pageMatches);

        const markerResult = this.scanPageForMarker(pageMatches, allMatches, trackerState.lastSeenMatchId);
        if (markerResult !== null) {
          markerFound = true;
          markerFoundAtIndex = markerResult;
          break;
        }
      } catch (error) {
        this.logService.error(
          error,
          new Map<string, JsonAny>([
            ["context", "IndividualTracker failed to retrieve player matches page"],
            ["trackerId", trackerState.trackerId],
            ["gamertag", trackerState.gamertag],
            ["page", page],
          ]),
        );
        if (this.isAuthError(error)) {
          this.clearUserHaloService();
        }
        throw error;
      }
    }

    this.logService.info(
      "IndividualTracker: fetched matches with marker scan",
      new Map<string, JsonAny>([
        ["trackerId", trackerState.trackerId],
        ["gamertag", trackerState.gamertag],
        ["totalFetched", allMatches.length],
        ["markerFound", markerFound],
        ["markerFoundAtIndex", markerFoundAtIndex],
      ]),
    );

    return { allMatches, markerFound, markerFoundAtIndex };
  }

  private scanPageForMarker(
    pageMatches: PlayerMatchHistory[],
    allMatches: PlayerMatchHistory[],
    lastSeenMatchId: string | undefined,
  ): number | null {
    if (lastSeenMatchId == null) {
      return null;
    }

    const markerIndex = pageMatches.findIndex((m) => m.MatchId === lastSeenMatchId);
    if (markerIndex !== -1) {
      return allMatches.length - pageMatches.length + markerIndex;
    }
    return null;
  }

  private getMatchesToProcessBeforeMarker(
    allMatches: PlayerMatchHistory[],
    markerFound: boolean,
    markerFoundAtIndex: number,
  ): PlayerMatchHistory[] {
    if (markerFound && markerFoundAtIndex >= 0) {
      return allMatches.slice(0, markerFoundAtIndex);
    }
    return allMatches;
  }

  private updateLastSeenMatchIdMarker(
    trackerState: IndividualTrackerInternalState,
    allMatches: PlayerMatchHistory[],
  ): void {
    if (allMatches.length > 0) {
      const newestMatch = Preconditions.checkExists(allMatches[0]);
      trackerState.lastSeenMatchId = newestMatch.MatchId;
    }
  }

  private async enrichScore(summary: IndividualTrackerMatchSummary): Promise<boolean> {
    let matchStats: MatchStats;
    try {
      matchStats = Preconditions.checkExists((await this.haloService.getMatchDetails([summary.matchId]))[0]);
    } catch (error) {
      if (this.isAuthError(error)) {
        this.clearUserHaloService();
        throw error;
      }
      this.logService.warn(
        error,
        new Map([
          ["context", "IndividualTracker: getMatchDetails failed"],
          ["matchId", summary.matchId],
        ]),
      );
      summary.score = "";
      return false;
    }

    summary.score = buildMatchScore(matchStats);
    const newRosterSignature = buildTeamRosterSignature(matchStats);
    if (summary.teamRosterSignature == null && newRosterSignature != null) {
      this.cachedResolvedRosterCount = (this.cachedResolvedRosterCount ?? 0) + 1;
    }
    summary.teamRosterSignature = newRosterSignature;
    summary.teamOutcomes = matchStats.Teams.map((team) => team.Outcome);

    return true;
  }

  private hasPendingRecompute(trackerState: IndividualTrackerInternalState): boolean {
    return trackerState.selectedMatchIds.join(",") !== (trackerState.accumulatedMatchIds ?? []).join(",");
  }

  private async recomputeAccumulatedTotals(trackerState: IndividualTrackerInternalState): Promise<void> {
    if (!this.hasPendingRecompute(trackerState)) {
      return;
    }

    delete trackerState.accumulatedPlayerTotals;
    trackerState.accumulatedMatchIds = [];

    for (const matchId of trackerState.selectedMatchIds) {
      let matchStats: MatchStats;
      try {
        matchStats = Preconditions.checkExists((await this.haloService.getMatchDetails([matchId]))[0]);
      } catch (error) {
        if (this.isAuthError(error)) {
          this.clearUserHaloService();
          throw error;
        }
        this.logService.warn(
          error,
          new Map([
            ["context", "IndividualTracker: recomputeAccumulatedTotals getMatchDetails failed"],
            ["matchId", matchId],
          ]),
        );
        continue;
      }
      if (accumulatePlayerStats(trackerState, matchStats)) {
        trackerState.accumulatedMatchIds.push(matchId);
      }
    }
  }

  private async resolveMapName(assetId: string, versionId: string): Promise<string> {
    try {
      return await this.haloService.getMapName(assetId, versionId);
    } catch (error) {
      if (this.isAuthError(error)) {
        this.clearUserHaloService();
        throw error;
      }
      this.logService.warn(
        error,
        new Map([
          ["context", "IndividualTracker: getMapName failed"],
          ["assetId", assetId],
          ["versionId", versionId],
        ]),
      );
      return "";
    }
  }

  private async resolveMapBackgroundUrl(assetId: string, versionId: string): Promise<string> {
    try {
      return (await this.haloService.getMapThumbnailUrl(assetId, versionId)) ?? "data:,";
    } catch (error) {
      if (this.isAuthError(error)) {
        this.clearUserHaloService();
        throw error;
      }
      this.logService.warn(
        error,
        new Map([
          ["context", "IndividualTracker: getMapThumbnailUrl failed"],
          ["assetId", assetId],
          ["versionId", versionId],
        ]),
      );
      return "data:,";
    }
  }

  private async markRegistryStopped(trackerState: IndividualTrackerInternalState): Promise<void> {
    try {
      const row = await this.services.databaseService.getIndividualTracker(trackerState.trackerId);
      if (row != null) {
        await this.services.individualTrackerService.markTrackerStatus(row, "stopped");
      }
    } catch (error) {
      this.logService.warn(
        error,
        new Map([
          ["context", "IndividualTracker: failed to mark registry stopped on idle timeout"],
          ["trackerId", trackerState.trackerId],
          ["gamertag", trackerState.gamertag],
        ]),
      );
    }
  }

  private async getUserHaloService(userId: string): Promise<HaloService> {
    if (this.userHaloService != null) {
      return this.userHaloService;
    }

    const client = await this.services.userTokenProvider.getClientForUser(userId);
    if (client == null) {
      throw new Error("No Halo credentials available for tracker owner");
    }

    this.userHaloService = this.services.haloService.withUserClient(client);
    this.userHaloServiceUserId = userId;
    return this.userHaloService;
  }

  private clearUserHaloService(): void {
    if (this.userHaloServiceUserId != null) {
      this.services.userTokenProvider.clearCachedClient(this.userHaloServiceUserId);
    }
    this.userHaloService = null;
    this.userHaloServiceUserId = null;
  }

  private get haloService(): HaloService {
    return Preconditions.checkExists(this.userHaloService);
  }

  private async fetchRankedArenaCsr(xuid: string): Promise<PlaylistCsrContainer | null> {
    try {
      const result = await this.haloService.getRankedArenaCsrs([xuid]);
      return result.get(xuid) ?? null;
    } catch (err: unknown) {
      if (this.isAuthError(err)) {
        this.clearUserHaloService();
      }
      this.logService.warn(
        err,
        new Map([
          ["context", "IndividualTracker: getRankedArenaCsrs failed"],
          ["xuid", xuid],
        ]),
      );
      return null;
    }
  }

  private async fetchPlayerEsra(xuid: string): Promise<PlayerEsraData | null> {
    try {
      return await this.haloService.getPlayerEsra(xuid);
    } catch (err: unknown) {
      if (this.isAuthError(err)) {
        this.clearUserHaloService();
      }
      this.logService.warn(
        err,
        new Map([
          ["context", "IndividualTracker: getPlayerEsra failed"],
          ["xuid", xuid],
        ]),
      );
      return null;
    }
  }

  private isAuthError(error: unknown): boolean {
    if (error instanceof RequestError) {
      return error.response.status === 401;
    }
    const message = error instanceof Error ? error.message : String(error);
    return /\b401\b|unauthorized|expired|spartan token/i.test(message);
  }

  private handleError(trackerState: IndividualTrackerInternalState, error: unknown): void {
    trackerState.errorState.consecutiveErrors += 1;
    trackerState.errorState.lastErrorMessage = error instanceof Error ? error.message : String(error);
    trackerState.errorState.backoffMinutes = Math.min(
      NORMAL_INTERVAL_MINUTES + trackerState.errorState.consecutiveErrors * CONSECUTIVE_ERROR_INTERVAL_MINUTES,
      MAX_BACKOFF_INTERVAL_MINUTES,
    );
    trackerState.lastUpdateTime = new Date().toISOString();
  }

  private getNextAlarmInterval(trackerState: IndividualTrackerInternalState): number {
    if (trackerState.errorState.consecutiveErrors > 0) {
      return trackerState.errorState.backoffMinutes * 60 * 1000;
    }
    return ALARM_INTERVAL_MS;
  }

  private async handleStart(request: Request): Promise<Response> {
    const parsed = await parseJsonBody(request, individualTrackerStartRequestSchema, "Invalid start request");
    if (!parsed.success) {
      return parsed.response;
    }
    const body = parsed.data;
    const now = new Date().toISOString();

    const trackerState: IndividualTrackerInternalState = {
      userId: body.userId,
      trackerId: body.trackerId,
      xuid: body.xuid,
      gamertag: body.gamertag,
      status: "active",
      isPaused: false,
      startTime: now,
      lastUpdateTime: now,
      searchStartTime: body.searchStartTime,
      lastMatchDiscoveredAt: undefined,
      checkCount: 0,
      matchIds: [],
      discoveredMatches: {},
      selectedMatchIds: [],
      idleTimeoutHours: body.idleTimeoutHours,
      errorState: {
        consecutiveErrors: 0,
        backoffMinutes: NORMAL_INTERVAL_MINUTES,
        lastSuccessTime: now,
        lastErrorMessage: undefined,
      },
    };

    await this.setState(trackerState);
    this.notifyUserTracker(trackerState);
    await this.state.storage.setAlarm(addMilliseconds(new Date(), ALARM_INTERVAL_MS).getTime());

    this.logService.info(
      "IndividualTracker: tracker started",
      new Map([
        ["userId", body.userId],
        ["trackerId", body.trackerId],
        ["gamertag", body.gamertag],
        ["searchStartTime", body.searchStartTime],
      ]),
    );

    return individualTrackerStartContract.toResponse({ success: true, state: this.sanitizeState(trackerState) });
  }

  private async handlePause(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    trackerState.isPaused = true;
    trackerState.status = "paused";
    trackerState.lastUpdateTime = new Date().toISOString();
    await this.state.storage.deleteAlarm();
    await this.setState(trackerState);
    this.notifyUserTracker(trackerState);
    this.broadcastViewState(trackerState);

    this.logService.info(
      "IndividualTracker: tracker paused",
      new Map([
        ["trackerId", trackerState.trackerId],
        ["gamertag", trackerState.gamertag],
      ]),
    );

    return individualTrackerPauseContract.toResponse({ success: true, state: this.sanitizeState(trackerState) });
  }

  private async handleResume(): Promise<Response> {
    const trackerState = await this.getState();
    if (!trackerState) {
      return new Response("Not Found", { status: 404 });
    }

    trackerState.isPaused = false;
    trackerState.status = "active";
    trackerState.lastUpdateTime = new Date().toISOString();
    await this.setState(trackerState);
    this.notifyUserTracker(trackerState);
    const resumeAlarmDelay = this.hasPendingRecompute(trackerState) ? 0 : ALARM_INTERVAL_MS;
    await this.state.storage.setAlarm(addMilliseconds(new Date(), resumeAlarmDelay).getTime());
    this.broadcastViewState(trackerState);

    this.logService.info(
      "IndividualTracker: tracker resumed",
      new Map([
        ["trackerId", trackerState.trackerId],
        ["gamertag", trackerState.gamertag],
      ]),
    );

    return individualTrackerResumeContract.toResponse({ success: true, state: this.sanitizeState(trackerState) });
  }

  private async handleStop(): Promise<Response> {
    const trackerState = await this.getState();

    await this.state.storage.deleteAlarm();
    await this.state.storage.delete(STATE_STORAGE_KEY);

    if (trackerState != null) {
      trackerState.status = "stopped";
      trackerState.lastUpdateTime = new Date().toISOString();
      this.notifyUserTracker(trackerState);
      this.broadcastViewState(trackerState);
      this.closeWebSockets("Tracker stopped");
      this.logService.info(
        "IndividualTracker: tracker stopped",
        new Map([
          ["trackerId", trackerState.trackerId],
          ["gamertag", trackerState.gamertag],
        ]),
      );
    }

    return individualTrackerStopContract.toResponse({ success: true });
  }

  private async handleSelectMatches(request: Request): Promise<Response> {
    const trackerState = await this.getState();
    if (trackerState == null) {
      return new Response("Not Found", { status: 404 });
    }

    const parsed = await parseJsonBody(request, selectMatchesRequestSchema, "Invalid select-matches request");
    if (!parsed.success) {
      return parsed.response;
    }
    const body = parsed.data;

    const incoming = [...new Set(body.matchIds)].sort();
    const selectionChanged = incoming.join(",") !== trackerState.selectedMatchIds.join(",");
    const seriesGroupsChanged = this.detectSeriesGroupChanges(trackerState, body.seriesGroups);

    const knownSummaries = new Map(Object.entries(trackerState.discoveredMatches));
    const needsHydration = incoming.filter((id) => !knownSummaries.has(id));

    if (needsHydration.length > 0) {
      const hydrationResult = await this.hydrateMatchSummaries(trackerState, needsHydration);
      if (!hydrationResult.success) {
        return errorContract.toResponse(
          { error: `Failed to hydrate matches: ${hydrationResult.failingIds.join(", ")}` },
          { status: 400, noStore: true },
        );
      }
      this.mergeHydratedMatches(trackerState, hydrationResult.summaries);
    }

    const hasHydration = needsHydration.length > 0;
    const unchanged = !hasHydration && !selectionChanged && !seriesGroupsChanged;

    if (unchanged) {
      return selectMatchesContract.toResponse({ success: true });
    }

    this.applySelectMatchesChanges(trackerState, incoming, body.seriesGroups, selectionChanged);

    await this.setState(trackerState);
    this.notifyUserTracker(trackerState);
    this.broadcastViewState(trackerState);
    if (selectionChanged && !trackerState.isPaused) {
      await this.state.storage.setAlarm(Date.now());
    }

    this.logService.info(
      "IndividualTracker: match selection updated",
      new Map<string, JsonAny>([
        ["trackerId", trackerState.trackerId],
        ["gamertag", trackerState.gamertag],
        ["selectedCount", incoming.length],
        ["seriesGroupCount", body.seriesGroups.length],
      ]),
    );

    return selectMatchesContract.toResponse({ success: true });
  }

  private detectSeriesGroupChanges(
    trackerState: IndividualTrackerInternalState,
    incomingSeriesGroups: IndividualTrackerSeriesGroupOverride[],
  ): boolean {
    const existingSeriesGroupOverrides = trackerState.seriesGroupOverrides ?? [];
    return (
      existingSeriesGroupOverrides.length !== incomingSeriesGroups.length ||
      !this.seriesGroupsAreEquivalent(existingSeriesGroupOverrides, incomingSeriesGroups)
    );
  }

  private mergeHydratedMatches(
    trackerState: IndividualTrackerInternalState,
    hydratedSummaries: Map<string, IndividualTrackerMatchSummary>,
  ): void {
    for (const [matchId, summary] of hydratedSummaries) {
      trackerState.discoveredMatches[matchId] = summary;
      if (!trackerState.matchIds.includes(matchId)) {
        trackerState.matchIds.push(matchId);
      }
    }

    trackerState.matchIds.sort((left, right) => {
      const leftSummary = trackerState.discoveredMatches[left];
      const rightSummary = trackerState.discoveredMatches[right];

      if (leftSummary != null && rightSummary != null) {
        return compareAsc(new Date(leftSummary.startTime), new Date(rightSummary.startTime));
      }

      if (leftSummary == null) {
        return 1;
      }
      if (rightSummary == null) {
        return -1;
      }

      return left.localeCompare(right);
    });
  }

  private applySelectMatchesChanges(
    trackerState: IndividualTrackerInternalState,
    incomingMatchIds: string[],
    incomingSeriesGroups: IndividualTrackerSeriesGroupOverride[],
    selectionChanged: boolean,
  ): void {
    trackerState.selectedMatchIds = incomingMatchIds;
    trackerState.seriesGroupOverrides = incomingSeriesGroups.map((group) => ({
      matchIds: [...group.matchIds],
      titleOverride: group.titleOverride,
      subtitleOverride: group.subtitleOverride,
    }));

    if (selectionChanged && trackerState.activeSeries != null) {
      const syncedMatchIdSet = new Set(incomingMatchIds);
      trackerState.activeSeries.matchIds = trackerState.activeSeries.matchIds.filter((id) => syncedMatchIdSet.has(id));
    }

    if (selectionChanged && !trackerState.isPaused) {
      delete trackerState.accumulatedPlayerTotals;
      trackerState.accumulatedMatchIds = [];
    }
  }

  private async hydrateMatchSummaries(
    trackerState: IndividualTrackerInternalState,
    matchIds: string[],
  ): Promise<
    { success: true; summaries: Map<string, IndividualTrackerMatchSummary> } | { success: false; failingIds: string[] }
  > {
    await this.getUserHaloService(trackerState.userId);

    const matchStatsById = await this.fetchMatchDetailsForIds(matchIds);
    const validation = this.validateAndCollectMatches(
      trackerState,
      matchIds,
      matchStatsById.failingIds,
      matchStatsById.summaries,
    );
    const mapNameResults = await this.resolveMapNamesForMatches(validation.validatedMatches);
    const mapBackgroundUrls = await this.resolveMapBackgroundsForMatches(validation.validatedMatches);
    const result = this.buildMatchSummaries(
      validation.validatedMatches,
      validation.failingIds,
      mapNameResults,
      mapBackgroundUrls,
    );

    return result;
  }

  private async fetchMatchDetailsForIds(
    matchIds: string[],
  ): Promise<{ summaries: Map<string, MatchStats>; failingIds: string[] }> {
    const matchPromises = matchIds.map(async (matchId) =>
      this.haloService.getMatchDetails([matchId]).then((results) => {
        if (results.length === 0) {
          throw new Error(`No match details returned for ${matchId}`);
        }
        return results[0];
      }),
    );

    const matchResults = await Promise.allSettled(matchPromises);

    const summaries = new Map<string, MatchStats>();
    const failingIds: string[] = [];

    for (let i = 0; i < matchResults.length; i++) {
      const matchId = matchIds[i];
      if (matchId == null) {
        continue;
      }

      const result = matchResults[i];
      if (result == null) {
        continue;
      }

      if (result.status === "rejected") {
        if (this.isAuthError(result.reason)) {
          this.clearUserHaloService();
          throw result.reason;
        }
        this.logService.warn(
          result.reason,
          new Map([
            ["context", "IndividualTracker: getMatchDetails failed for ID"],
            ["matchId", matchId],
          ]),
        );
        failingIds.push(matchId);
        continue;
      }

      const matchStats = result.value;
      if (matchStats != null) {
        summaries.set(matchId, matchStats);
      }
    }

    return { summaries, failingIds };
  }

  private validateAndCollectMatches(
    trackerState: IndividualTrackerInternalState,
    matchIds: string[],
    initialFailingIds: string[],
    matchStatsById: Map<string, MatchStats>,
  ): {
    validatedMatches: {
      matchId: string;
      matchStats: MatchStats;
      playerEntry: MatchStats["Players"][0];
    }[];
    failingIds: string[];
  } {
    const failingIds: string[] = [...initialFailingIds];
    const validatedMatches: {
      matchId: string;
      matchStats: MatchStats;
      playerEntry: MatchStats["Players"][0];
    }[] = [];

    for (const matchId of matchIds) {
      if (initialFailingIds.includes(matchId)) {
        continue;
      }
      const matchStats = matchStatsById.get(matchId);

      try {
        if (matchStats == null) {
          failingIds.push(matchId);
          continue;
        }

        const playerEntry = matchStats.Players.find((p) => getPlayerXuid(p) === trackerState.xuid);
        if (playerEntry == null) {
          failingIds.push(matchId);
          continue;
        }

        validatedMatches.push({ matchId, matchStats, playerEntry });
      } catch (error) {
        if (this.isAuthError(error)) {
          this.clearUserHaloService();
          throw error;
        }
        this.logService.warn(
          error,
          new Map([
            ["context", "IndividualTracker: hydrateMatchSummaries validation failed"],
            ["matchId", matchId],
          ]),
        );
        failingIds.push(matchId);
      }
    }

    return { validatedMatches, failingIds };
  }

  private async resolveMapNamesForMatches(
    validatedMatches: {
      matchId: string;
      matchStats: MatchStats;
      playerEntry: MatchStats["Players"][0];
    }[],
  ): Promise<PromiseSettledResult<string>[]> {
    const mapNamePromises = validatedMatches.map(async (m) =>
      this.resolveMapName(m.matchStats.MatchInfo.MapVariant.AssetId, m.matchStats.MatchInfo.MapVariant.VersionId),
    );
    return Promise.allSettled(mapNamePromises);
  }

  private async resolveMapBackgroundsForMatches(
    validatedMatches: {
      matchId: string;
      matchStats: MatchStats;
      playerEntry: MatchStats["Players"][0];
    }[],
  ): Promise<string[]> {
    const mapBackgroundPromises = validatedMatches.map(async (m) =>
      this.resolveMapBackgroundUrl(
        m.matchStats.MatchInfo.MapVariant.AssetId,
        m.matchStats.MatchInfo.MapVariant.VersionId,
      ),
    );
    return Promise.all(mapBackgroundPromises);
  }

  private buildMatchSummaries(
    validatedMatches: {
      matchId: string;
      matchStats: MatchStats;
      playerEntry: MatchStats["Players"][0];
    }[],
    initialFailingIds: string[],
    mapNameResults: PromiseSettledResult<string>[],
    mapBackgroundUrls: string[],
  ):
    | { success: true; summaries: Map<string, IndividualTrackerMatchSummary> }
    | { success: false; failingIds: string[] } {
    const summaries = new Map<string, IndividualTrackerMatchSummary>();
    const failingIds: string[] = [...initialFailingIds];

    for (let i = 0; i < validatedMatches.length; i++) {
      const validated = validatedMatches[i];
      if (validated == null) {
        continue;
      }

      const { matchId, matchStats, playerEntry } = validated;
      const mapNameResult = mapNameResults[i];
      if (mapNameResult == null) {
        continue;
      }
      const mapBackgroundUrl = mapBackgroundUrls[i] ?? "data:,";

      if (mapNameResult.status === "rejected") {
        if (this.isAuthError(mapNameResult.reason)) {
          this.clearUserHaloService();
          throw mapNameResult.reason;
        }
        this.logService.warn(
          mapNameResult.reason,
          new Map([
            ["context", "IndividualTracker: map name resolution failed"],
            ["matchId", matchId],
          ]),
        );
        failingIds.push(matchId);
        continue;
      }

      const outcome = getMatchOutcomeLabel(playerEntry.Outcome);
      const mapName = mapNameResult.value;

      summaries.set(matchId, {
        matchId,
        startTime: matchStats.MatchInfo.StartTime,
        endTime: matchStats.MatchInfo.EndTime,
        mapAssetId: matchStats.MatchInfo.MapVariant.AssetId,
        mapVersionId: matchStats.MatchInfo.MapVariant.VersionId,
        mapName,
        mapBackgroundUrl,
        modeAssetId: matchStats.MatchInfo.UgcGameVariant.AssetId,
        gameVariantCategory: matchStats.MatchInfo.GameVariantCategory,
        outcome,
        score: buildMatchScore(matchStats),
        isMatchmaking: matchStats.MatchInfo.Playlist != null,
        teamRosterSignature: buildTeamRosterSignature(matchStats),
        teamOutcomes: matchStats.Teams.map((team) => team.Outcome),
      });
    }

    if (failingIds.length > 0) {
      return { success: false, failingIds };
    }

    return { success: true, summaries };
  }

  private seriesGroupsAreEquivalent(
    existing: IndividualTrackerSeriesGroupOverride[],
    incoming: IndividualTrackerSeriesGroupOverride[],
  ): boolean {
    if (existing.length !== incoming.length) {
      return false;
    }

    const existingKeys = new Set(existing.map((group) => this.buildSeriesGroupComparisonKey(group)));
    const incomingKeys = new Set(incoming.map((group) => this.buildSeriesGroupComparisonKey(group)));

    if (existingKeys.size !== incomingKeys.size) {
      return false;
    }

    for (const key of existingKeys) {
      if (!incomingKeys.has(key)) {
        return false;
      }
    }

    return true;
  }

  private buildSeriesGroupComparisonKey(group: IndividualTrackerSeriesGroupOverride): string {
    const matchIdKey = buildSeriesGroupKey(group.matchIds);
    const titleKey = JSON.stringify(group.titleOverride);
    const subtitleKey = JSON.stringify(group.subtitleOverride);
    return `${matchIdKey}:${titleKey}:${subtitleKey}`;
  }

  private async handleStartSeries(request: Request): Promise<Response> {
    const trackerState = await this.getState();
    if (trackerState == null) {
      return new Response("Not Found", { status: 404 });
    }

    const parsed = await parseJsonBody(request, startSeriesRequestSchema, "Invalid start-series request");
    if (!parsed.success) {
      return parsed.response;
    }
    const body = parsed.data;

    const teams: SeriesTeam[] = body.teams.map((team, teamIndex) => ({
      id: teamIndex,
      name: team.name,
      players: team.members.map((gamertag) => ({ discordId: null, discordName: null, gamertag, xboxId: null })),
    }));

    this.retireActiveSeries(trackerState);
    trackerState.activeSeries = {
      title: body.titleOverride ?? getDefaultSeriesGroupTitle(),
      subtitle: body.subtitleOverride,
      guildIconUrl: null,
      teams,
      matchIds: body.matchIds ?? [],
      startedAt: new Date().toISOString(),
      isActive: true,
    };
    trackerState.lastUpdateTime = new Date().toISOString();

    await this.setState(trackerState);
    this.notifyUserTracker(trackerState);
    this.broadcastViewState(trackerState);

    this.logService.info(
      "IndividualTracker: series started",
      new Map([
        ["trackerId", trackerState.trackerId],
        ["gamertag", trackerState.gamertag],
      ]),
    );

    return startSeriesContract.toResponse({ success: true });
  }

  private async handleEndSeries(): Promise<Response> {
    const trackerState = await this.getState();
    if (trackerState == null) {
      return new Response("Not Found", { status: 404 });
    }

    if (trackerState.activeSeries == null) {
      return new Response("No active series", { status: 409 });
    }

    this.retireActiveSeries(trackerState);
    trackerState.lastUpdateTime = new Date().toISOString();

    await this.setState(trackerState);
    this.notifyUserTracker(trackerState);
    this.broadcastViewState(trackerState);

    this.logService.info(
      "IndividualTracker: series ended",
      new Map([
        ["trackerId", trackerState.trackerId],
        ["gamertag", trackerState.gamertag],
      ]),
    );

    return endSeriesContract.toResponse({ success: true });
  }

  private async handleEditSeries(request: Request): Promise<Response> {
    const trackerState = await this.getState();
    if (trackerState?.activeSeries == null) {
      return new Response("No active series", { status: 409 });
    }

    const parsed = await parseJsonBody(request, editSeriesRequestSchema, "Invalid edit-series request");
    if (!parsed.success) {
      return parsed.response;
    }
    const body = parsed.data;
    if (body.titleOverride !== undefined) {
      trackerState.activeSeries.title = body.titleOverride ?? getDefaultSeriesGroupTitle();
    }
    if (body.subtitleOverride !== undefined) {
      trackerState.activeSeries.subtitle = body.subtitleOverride;
    }
    if (body.teams !== undefined) {
      trackerState.activeSeries.teams = body.teams.map((team, teamIndex) => ({
        id: teamIndex,
        name: team.name,
        players: team.members.map((gamertag) => ({ discordId: null, discordName: null, gamertag, xboxId: null })),
      }));
    }

    trackerState.lastUpdateTime = new Date().toISOString();

    await this.setState(trackerState);
    this.notifyUserTracker(trackerState);
    this.broadcastViewState(trackerState);

    return editSeriesContract.toResponse({ success: true });
  }

  private async handleResumeSeries(): Promise<Response> {
    const trackerState = await this.getState();
    if (trackerState == null) {
      return new Response("No completed series to resume", { status: 422 });
    }

    if (trackerState.activeSeries != null) {
      return new Response("Active series already exists", { status: 409 });
    }

    if (trackerState.completedSeries == null || trackerState.completedSeries.length === 0) {
      return new Response("No completed series to resume", { status: 422 });
    }

    const resumed = Preconditions.checkExists(
      trackerState.completedSeries.pop(),
      "completedSeries was unexpectedly empty",
    );
    trackerState.activeSeries = { ...resumed, isActive: true };
    trackerState.lastUpdateTime = new Date().toISOString();

    await this.setState(trackerState);
    this.broadcastViewState(trackerState);

    this.logService.info(
      "IndividualTracker: series resumed",
      new Map([
        ["trackerId", trackerState.trackerId],
        ["gamertag", trackerState.gamertag],
      ]),
    );

    return resumeSeriesContract.toResponse({ success: true });
  }

  private async handleNudge(request: Request): Promise<Response> {
    const trackerState = await this.getState();
    if (trackerState == null) {
      return new Response("Not Found", { status: 404 });
    }

    const parsed = await parseJsonBody(request, nudgePayloadSchema, "Invalid nudge request");
    if (!parsed.success) {
      return parsed.response;
    }
    const payload = parsed.data;

    switch (payload.type) {
      case "ended": {
        this.retireActiveSeries(trackerState);
        break;
      }
      case "substituted": {
        const trackedXuid = trackerState.xuid;
        const trackedGamertag = trackerState.gamertag;
        const isTrackedPlayerOut =
          (payload.playerOut.xboxId != null && trackedXuid === payload.playerOut.xboxId) ||
          trackedGamertag === payload.playerOut.gamertag;
        const isTrackedPlayerIn =
          (payload.playerIn.xboxId != null && trackedXuid === payload.playerIn.xboxId) ||
          trackedGamertag === payload.playerIn.gamertag;

        if (isTrackedPlayerOut) {
          this.retireActiveSeries(trackerState);
          this.logService.info(
            "IndividualTracker: series retired (tracked player subbed out via nudge)",
            new Map([
              ["trackerId", trackerState.trackerId],
              ["gamertag", trackerState.gamertag],
            ]),
          );
        } else if (isTrackedPlayerIn && trackerState.activeSeries == null) {
          const completedSeries = trackerState.completedSeries ?? [];
          const resumedSeries: ActiveSeries | null = completedSeries.at(-1) ?? null;

          if (resumedSeries != null) {
            trackerState.activeSeries = this.applySubstitutionToSeries(
              {
                ...resumedSeries,
                matchIds: [],
                startedAt: new Date().toISOString(),
                isActive: true,
              },
              payload,
            );
            trackerState.completedSeries = completedSeries.filter((s) => s !== resumedSeries);
          } else {
            trackerState.activeSeries = {
              title: "Series",
              subtitle: null,
              guildIconUrl: null,
              teams: [],
              matchIds: [],
              startedAt: new Date().toISOString(),
              isActive: true,
            };
          }

          this.logService.info(
            "IndividualTracker: series resumed/created (tracked player subbed in via nudge)",
            new Map([
              ["trackerId", trackerState.trackerId],
              ["gamertag", trackerState.gamertag],
            ]),
          );
        } else if (trackerState.activeSeries != null) {
          trackerState.activeSeries = this.applySubstitutionToSeries(trackerState.activeSeries, payload);

          this.logService.debug(
            "IndividualTracker: team roster updated via nudge substitution",
            new Map([
              ["trackerId", trackerState.trackerId],
              ["teamId", String(payload.teamId)],
            ]),
          );
        }

        break;
      }
      case "started": {
        this.retireActiveSeries(trackerState);
        trackerState.activeSeries = {
          title: payload.title,
          subtitle: payload.subtitle,
          guildIconUrl: payload.guildIconUrl,
          teams: payload.teams,
          matchIds: [],
          startedAt: new Date().toISOString(),
          isActive: true,
        };

        this.logService.info(
          "IndividualTracker: series started via nudge",
          new Map([
            ["trackerId", trackerState.trackerId],
            ["gamertag", trackerState.gamertag],
            ["title", payload.title],
          ]),
        );

        break;
      }
      default: {
        throw new UnreachableError(payload);
      }
    }

    trackerState.lastUpdateTime = new Date().toISOString();

    await this.setState(trackerState);
    this.notifyUserTracker(trackerState);
    this.broadcastViewState(trackerState);
    await this.state.storage.setAlarm(Date.now());

    return individualTrackerNudgeContract.toResponse({ success: true });
  }

  private async handleRefresh(): Promise<Response> {
    const trackerState = await this.getState();
    if (trackerState == null) {
      return new Response("Not Found", { status: 404 });
    }

    if (trackerState.status !== "active" || trackerState.isPaused) {
      return errorContract.toResponse(
        { error: "Only active trackers can be refreshed" },
        { status: 409, noStore: true },
      );
    }

    await this.pollAndPersist(trackerState, true, "IndividualTracker manual refresh failed");

    return individualTrackerRefreshContract.toResponse({ success: true });
  }

  private async handleStatus(): Promise<Response> {
    const trackerState = await this.getState();
    return individualTrackerStatusContract.toResponse({
      state: trackerState == null ? null : this.sanitizeState(trackerState),
    });
  }

  private async handleViewState(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const statsHighlightSlots = parseStatsHighlightSlots(url);

    const trackerState = await this.getState();
    const statsHighlights =
      trackerState != null && statsHighlightSlots.length > 0
        ? await this.buildStatsHighlights(trackerState, statsHighlightSlots)
        : undefined;
    const preSeriesPlayerInfo = trackerState != null ? await this.getPreSeriesPlayerInfo(trackerState) : undefined;

    if (trackerState == null) {
      return individualTrackerViewStateContract.toResponse({ state: null });
    }
    const viewState = this.toViewState(trackerState);
    return individualTrackerViewStateContract.toResponse({
      state: {
        ...viewState,
        ...(statsHighlights != null ? { statsHighlights: [...statsHighlights] } : {}),
        ...(preSeriesPlayerInfo != null ? { preSeriesPlayerInfo } : {}),
      },
    });
  }

  private getPreSeriesPlayerInfoCacheKey(state: IndividualTrackerInternalState): string | null {
    return state.lastSeenMatchId ?? state.matchIds.at(-1) ?? null;
  }

  private async getPreSeriesPlayerInfo(
    state: IndividualTrackerInternalState,
  ): Promise<PreSeriesPlayerInfo | undefined> {
    const cacheKey = this.getPreSeriesPlayerInfoCacheKey(state);
    if (state.preSeriesPlayerInfoLatestMatchId === cacheKey) {
      return state.preSeriesPlayerInfo;
    }

    const preSeriesPlayerInfo = await this.buildPreSeriesPlayerInfo(state);
    if (preSeriesPlayerInfo !== undefined) {
      state.preSeriesPlayerInfo = preSeriesPlayerInfo;
    } else {
      delete state.preSeriesPlayerInfo;
    }
    state.preSeriesPlayerInfoLatestMatchId = cacheKey;
    await this.setState(state);
    return preSeriesPlayerInfo;
  }

  private async buildPreSeriesPlayerInfo(
    state: IndividualTrackerInternalState,
  ): Promise<PreSeriesPlayerInfo | undefined> {
    try {
      await this.getUserHaloService(state.userId);
    } catch (err: unknown) {
      this.logService.warn(
        err,
        new Map([
          ["context", "IndividualTracker: getUserHaloService failed in buildPreSeriesPlayerInfo"],
          ["userId", state.userId],
          ["xuid", state.xuid],
        ]),
      );
      return undefined;
    }

    const [csrContainer, esraData] = await Promise.all([
      this.fetchRankedArenaCsr(state.xuid),
      this.fetchPlayerEsra(state.xuid),
    ]);

    const currentRank = csrContainer?.Current.Value;
    const allTimePeakRank = csrContainer?.AllTimeMax.Value;
    const esra = esraData?.esra;

    const info: PreSeriesPlayerInfo = {
      currentRank: currentRank != null && currentRank > 0 ? currentRank : null,
      currentRankTier: normalizeRankTier(csrContainer?.Current.Tier),
      currentRankSubTier: csrContainer?.Current.SubTier ?? null,
      currentRankMeasurementMatchesRemaining: csrContainer?.Current.MeasurementMatchesRemaining ?? null,
      currentRankInitialMeasurementMatches: csrContainer?.Current.InitialMeasurementMatches ?? null,
      allTimePeakRank: allTimePeakRank != null && allTimePeakRank > 0 ? allTimePeakRank : null,
      esra: esra != null && esra >= 0 ? esra : null,
      lastRankedGamePlayed: esraData?.lastRankedGamePlayed ?? null,
    };

    if (
      info.currentRank == null &&
      info.allTimePeakRank == null &&
      info.esra == null &&
      info.lastRankedGamePlayed == null
    ) {
      return undefined;
    }

    return info;
  }

  private async buildStatsHighlights(
    state: IndividualTrackerInternalState,
    statsHighlightSlots: readonly IndividualStatsHighlightOption[],
  ): Promise<readonly StatsHighlightItem[]> {
    const hasRankSlot =
      statsHighlightSlots.includes("current-rank") ||
      statsHighlightSlots.includes("season-peak") ||
      statsHighlightSlots.includes("all-time-peak");
    const hasEsraSlot = statsHighlightSlots.includes("esra");

    if (!hasRankSlot && !hasEsraSlot) {
      const latestMatchId = state.matchIds.at(-1) ?? "";
      const accumulatedCount = state.accumulatedMatchIds?.length ?? 0;
      this.cachedResolvedRosterCount ??= Object.values(state.discoveredMatches).filter(
        (s) => s.teamRosterSignature != null,
      ).length;
      const selectionKey = state.selectedMatchIds.join(",");
      const cacheKey = `${latestMatchId}:${accumulatedCount.toString()}:${this.cachedResolvedRosterCount.toString()}:${JSON.stringify(statsHighlightSlots)}:${selectionKey}`;

      if (this.statsHighlightsCacheKey === cacheKey && this.cachedStatsHighlights != null) {
        return this.cachedStatsHighlights;
      }

      const stats = computeStatsHighlights(state, statsHighlightSlots, undefined, undefined);
      this.statsHighlightsCacheKey = cacheKey;
      this.cachedStatsHighlights = stats;
      return stats;
    }

    try {
      await this.getUserHaloService(state.userId);
    } catch (err: unknown) {
      this.logService.warn(
        err,
        new Map([
          ["context", "IndividualTracker: getUserHaloService failed in buildStatsHighlights"],
          ["userId", state.userId],
          ["xuid", state.xuid],
        ]),
      );
      return computeStatsHighlights(state, statsHighlightSlots, null, null);
    }

    const [csrContainer, esraData] = await Promise.all([
      hasRankSlot ? this.fetchRankedArenaCsr(state.xuid) : Promise.resolve(null),
      hasEsraSlot ? this.fetchPlayerEsra(state.xuid) : Promise.resolve(null),
    ]);

    return computeStatsHighlights(state, statsHighlightSlots, csrContainer, esraData);
  }

  private async getState(): Promise<IndividualTrackerInternalState | null> {
    const state = await this.state.storage.get<IndividualTrackerInternalState>(STATE_STORAGE_KEY);
    return state ?? null;
  }

  private async setState(state: IndividualTrackerInternalState): Promise<void> {
    await this.state.storage.put(STATE_STORAGE_KEY, state);
  }

  private notifyUserTracker(state: IndividualTrackerInternalState): void {
    void this.notifyUserTrackerAsync(state);
  }

  private async notifyUserTrackerAsync(state: IndividualTrackerInternalState): Promise<void> {
    try {
      const doId = this.env.USER_TRACKER_DO.idFromName(state.userId);
      const stub = this.env.USER_TRACKER_DO.get(doId);
      const response = await stub.fetch(
        new Request("http://do/nudge", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: state.userId,
            trackerId: state.trackerId,
            lastUpdateTime: state.lastUpdateTime,
          }),
        }),
      );

      if (!response.ok) {
        this.logService.warn(
          `UserTracker nudge returned status ${response.status.toString()}`,
          new Map([
            ["context", "IndividualTracker: UserTracker nudge error"],
            ["userId", state.userId],
            ["trackerId", state.trackerId],
            ["status", response.status.toString()],
          ]),
        );
      }
    } catch (error) {
      this.logService.warn(
        error,
        new Map([
          ["context", "IndividualTracker: UserTracker nudge exception"],
          ["userId", state.userId],
          ["trackerId", state.trackerId],
        ]),
      );
    }
  }

  private applySubstitutionToSeries(series: ActiveSeries, payload: SeriesSubstitutedPayload): ActiveSeries {
    const matchesPlayerOut = (player: SeriesPlayer): boolean => {
      if (payload.playerOut.xboxId != null && player.xboxId != null) {
        return player.xboxId === payload.playerOut.xboxId;
      }

      if (payload.playerOut.discordId != null && player.discordId != null) {
        return player.discordId === payload.playerOut.discordId;
      }

      return player.gamertag != null && player.gamertag === payload.playerOut.gamertag;
    };

    const updatedTeams = series.teams.map((team, teamIndex) => {
      const normalizedTeamId = teamIndex;
      if (normalizedTeamId === payload.teamId || team.id === payload.teamId) {
        return {
          ...team,
          id: normalizedTeamId,
          players: team.players.map((player) => (matchesPlayerOut(player) ? payload.playerIn : player)),
        };
      }

      return {
        ...team,
        id: normalizedTeamId,
      };
    });

    return {
      ...series,
      teams: updatedTeams,
    };
  }

  private retireActiveSeries(state: IndividualTrackerInternalState): void {
    if (state.activeSeries == null) {
      return;
    }
    state.completedSeries = [...(state.completedSeries ?? []), { ...state.activeSeries, isActive: false }];
    delete state.activeSeries;
  }

  private sanitizeState(state: IndividualTrackerInternalState): IndividualTrackerDoState {
    return {
      userId: state.userId,
      trackerId: state.trackerId,
      xuid: state.xuid,
      gamertag: state.gamertag,
      status: state.status,
      isPaused: state.isPaused,
      startTime: state.startTime,
      lastUpdateTime: state.lastUpdateTime,
      searchStartTime: state.searchStartTime,
      idleTimeoutHours: state.idleTimeoutHours,
      hasActiveSeries: state.activeSeries != null,
    };
  }

  private toViewState(state: IndividualTrackerInternalState): IndividualTrackerViewState {
    const activeIds = getActiveMatchIds(state);
    const summaries = state.matchIds
      .filter((matchId) => activeIds.has(matchId))
      .map((matchId) => state.discoveredMatches[matchId])
      .filter((match): match is IndividualTrackerMatchSummary => match != null)
      .sort((left, right) => compareAsc(new Date(left.startTime), new Date(right.startTime)));

    const summariesById = new Map(summaries.map((summary) => [summary.matchId, summary]));

    const autoGroupings = analyzeMatchGroupings(
      summaries.map((summary) => ({
        matchId: summary.matchId,
        isMatchmaking: summary.isMatchmaking,
        teamRosterSignature: summary.teamRosterSignature,
      })),
    );

    const activeSeriesMatchIds = state.activeSeries?.matchIds ?? [];
    const activeSeriesMatchIdSet = new Set(activeSeriesMatchIds);
    const groupings =
      activeSeriesMatchIds.length >= 2
        ? [activeSeriesMatchIds, ...autoGroupings.filter((g) => !g.some((id) => activeSeriesMatchIdSet.has(id)))]
        : autoGroupings;

    const allSeriesContexts: ActiveSeries[] = [
      ...(state.activeSeries != null ? [state.activeSeries] : []),
      ...(state.completedSeries ?? []),
    ];
    const seriesGroupOverridesByKey = new Map<string, IndividualTrackerSeriesGroupOverride>();
    for (const override of state.seriesGroupOverrides ?? []) {
      seriesGroupOverridesByKey.set(buildSeriesGroupKey(override.matchIds), override);
    }

    const series = groupings.map((matchIds): IndividualTrackerSeriesGroup => {
      const groupSummaries = matchIds
        .map((matchId) => summariesById.get(matchId))
        .filter((summary): summary is IndividualTrackerMatchSummary => summary != null);

      const teamWins = computeSeriesTeamWins(
        groupSummaries.map((summary) => ({
          startTime: summary.startTime,
          mapAssetId: summary.mapAssetId,
          mapVersionId: summary.mapVersionId,
          gameVariantCategory: summary.gameVariantCategory,
          teamOutcomes: summary.teamOutcomes ?? [],
        })),
      );

      const defaultTitle = getDefaultSeriesGroupTitle();
      const defaultSubtitle = getDefaultSeriesGroupSubtitle(
        groupSummaries.map((summary) => ({
          startTime: summary.startTime,
          mapAssetId: summary.mapAssetId,
          mapVersionId: summary.mapVersionId,
          gameVariantCategory: summary.gameVariantCategory,
          outcome: summary.outcome,
        })),
      );

      const matchIdSet = new Set(matchIds);
      const seriesContext = allSeriesContexts.find((ctx) => ctx.matchIds.some((id) => matchIdSet.has(id)));
      const seriesGroupOverride = seriesGroupOverridesByKey.get(buildSeriesGroupKey(matchIds));

      const title = seriesContext?.title ?? seriesGroupOverride?.titleOverride ?? defaultTitle;
      const subtitle = seriesContext?.subtitle ?? seriesGroupOverride?.subtitleOverride ?? defaultSubtitle;
      const guildIconUrl = seriesContext?.guildIconUrl ?? null;
      const teams = seriesContext?.teams;

      return {
        id: `series:${buildSeriesGroupKey(matchIds)}`,
        matchIds,
        matchBackgroundUrls: groupSummaries.map((summary) => summary.mapBackgroundUrl || "data:,"),
        score: teamWins.length === 0 ? "0:0" : teamWins.join(":"),
        title,
        subtitle,
        guildIconUrl,
        ...(teams !== undefined ? { teams } : {}),
      };
    });

    const lastTrackedMatchId = state.matchIds.at(-1);
    const lastCompletedSeries = state.completedSeries?.at(-1);
    const hasRecentCompletedSeries =
      state.activeSeries == null &&
      lastTrackedMatchId != null &&
      (lastCompletedSeries?.matchIds.includes(lastTrackedMatchId) ?? false);

    return {
      trackerId: state.trackerId,
      gamertag: state.gamertag,
      status: state.status,
      matches: summaries.map((summary) => ({
        matchId: summary.matchId,
        startTime: summary.startTime,
        endTime: summary.endTime,
        mapAssetId: summary.mapAssetId,
        mapVersionId: summary.mapVersionId,
        mapName: summary.mapName,
        mapBackgroundUrl: summary.mapBackgroundUrl,
        modeAssetId: summary.modeAssetId,
        gameVariantCategory: summary.gameVariantCategory,
        outcome: summary.outcome,
        score: summary.score,
        isMatchmaking: summary.isMatchmaking,
      })),
      series,
      lastUpdateTime: state.lastUpdateTime,
      lastMatchDiscoveredAt: state.lastMatchDiscoveredAt ?? null,
      hasActiveSeries: state.activeSeries != null,
      hasRecentCompletedSeries,
      ...(state.lastSuccessfulFetch !== undefined ? { lastSuccessfulFetch: state.lastSuccessfulFetch } : {}),
      ...(state.activeSeries != null
        ? {
            activeSeriesContext: {
              title: state.activeSeries.title,
              subtitle: state.activeSeries.subtitle,
              teams: state.activeSeries.teams,
            },
          }
        : {}),
    };
  }

  private viewMessage(state: IndividualTrackerInternalState): string {
    return trackerViewMessageContract.serialize({ type: "view", view: this.toViewState(state) });
  }

  private async handleWebSocket(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get("Upgrade");
    if (upgradeHeader !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const trackerState = await this.getState();
    this.logService.info(
      "IndividualTracker: WebSocket connection requested",
      new Map([
        ["trackerId", trackerState?.trackerId ?? "unknown"],
        ["gamertag", trackerState?.gamertag ?? "unknown"],
      ]),
    );
    try {
      const response = this.webSocketAdapter.upgrade(
        this.state,
        trackerState != null ? this.viewMessage(trackerState) : undefined,
      );
      this.logService.info(
        "IndividualTracker: WebSocket connection established",
        new Map([
          ["trackerId", trackerState?.trackerId ?? "unknown"],
          ["gamertag", trackerState?.gamertag ?? "unknown"],
        ]),
      );
      return response;
    } catch (error) {
      this.logService.error(error, new Map([["context", "IndividualTracker: failed to establish WebSocket"]]));
      return new Response("Failed to establish WebSocket connection", { status: 500 });
    }
  }

  webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): void {
    this.logService.debug(
      "IndividualTracker: WebSocket message received (ignored)",
      new Map([["messageType", typeof message]]),
    );
  }

  webSocketClose(_ws: WebSocket, code: number, reason: string, wasClean: boolean): void {
    this.logService.debug(
      "IndividualTracker: WebSocket client disconnected",
      new Map<string, JsonAny>([
        ["code", code],
        ["reason", reason],
        ["wasClean", wasClean],
      ]),
    );
  }

  webSocketError(_ws: WebSocket, error: unknown): void {
    this.logService.warn(error, new Map([["context", "IndividualTracker: WebSocket error"]]));
  }

  private broadcastViewState(state: IndividualTrackerInternalState): void {
    this.webSocketAdapter.broadcast(this.state, this.viewMessage(state));
  }

  private closeWebSockets(reason: string): void {
    this.webSocketAdapter.closeAll(this.state, 1000, reason);
  }
}
