import { errorContract } from "@guilty-spark/shared/contracts/error";
import type {
  TrackerProfileResponse,
  UpdateTrackerProfileRequest,
} from "@guilty-spark/shared/contracts/individual-tracker/profile";
import { trackerProfileContract } from "@guilty-spark/shared/contracts/individual-tracker/profile";
import type {
  StartTrackerRequest,
  TrackerResponse,
  TrackersResponse,
} from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import {
  refreshTrackerContract,
  selectMatchesContract,
  stopTrackerContract,
  trackerContract,
  trackersContract,
} from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import {
  getMatchOutcomeLabel,
  buildTeamRosterSignature,
  analyzeMatchGroupings,
} from "@guilty-spark/shared/halo/match-enrichment";
import { getReadableDuration } from "@guilty-spark/shared/halo/duration";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { HaloInfiniteClient, MapAsset, MatchStats, UgcGameVariantAsset } from "halo-infinite-api";
import { AssetKind, MatchType } from "halo-infinite-api";
import {
  buildMatchResultString,
  buildTeams,
  formatDisplayDateTime,
  getCsrLabel,
  getMapThumbnailUrl,
  getRankAndCsrLabels,
  getRankLabel,
  RANKED_ARENA_PLAYLIST_ID,
} from "./match-history-helpers";
import { RealTrackerViewConnection } from "./view-connection";
import type {
  EditSeriesRequest,
  IndividualTrackerConnection,
  IndividualTrackerService,
  StartSeriesRequest,
  StartSeriesResponse,
  TrackerListResponse,
  TrackerMatchHistoryEntry,
  TrackerMatchHistoryResponse,
  TrackerSearchResult,
  TrackerStatusResponse,
  TrackerSyncMatchesRequest,
} from "./types";

const XUID_BATCH_SIZE = 24;

interface IndividualTrackerServiceOpts {
  readonly apiHost: string;
  readonly haloInfiniteClient: HaloInfiniteClient;
}

export class RealIndividualTrackerService implements IndividualTrackerService {
  private readonly apiHost: string;
  private readonly haloInfiniteClient: HaloInfiniteClient;
  private readonly mapCache = new Map<string, Promise<MapAsset>>();
  private readonly modeNameCache = new Map<string, Promise<UgcGameVariantAsset>>();
  private readonly playlistNameCache = new Map<string, Promise<string | null>>();

  public constructor({ apiHost, haloInfiniteClient }: IndividualTrackerServiceOpts) {
    this.apiHost = apiHost;
    this.haloInfiniteClient = haloInfiniteClient;
  }

  private buildUrl(path: string): string {
    const baseUrl = this.apiHost.endsWith("/") ? this.apiHost.slice(0, -1) : this.apiHost;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
  }

  private async readError(response: Response): Promise<Error> {
    const body = await response.text();
    if (body !== "") {
      try {
        const parsed = errorContract.safeParse(JSON.parse(body));
        if (parsed.success && parsed.data.error !== "") {
          return new Error(parsed.data.error);
        }
        return new Error(`Request failed (${String(response.status)})`);
      } catch {
        return new Error(body);
      }
    }

    return new Error(`Request failed (${String(response.status)})`);
  }

  public async getProfile(): Promise<TrackerProfileResponse> {
    const response = await fetch(this.buildUrl("/api/individual-tracker/profile"), {
      credentials: "include",
      method: "GET",
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerProfileContract.fromResponse(response);
  }

  public async updateProfile(req: UpdateTrackerProfileRequest): Promise<TrackerProfileResponse> {
    const response = await fetch(this.buildUrl("/api/individual-tracker/profile"), {
      credentials: "include",
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerProfileContract.fromResponse(response);
  }

  public async listTrackers(): Promise<TrackersResponse> {
    const response = await fetch(this.buildUrl("/api/individual-tracker/manage/trackers"), {
      credentials: "include",
      method: "GET",
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackersContract.fromResponse(response);
  }

  public async startTracker(req: StartTrackerRequest): Promise<TrackerResponse> {
    const response = await fetch(this.buildUrl("/api/individual-tracker/manage/start"), {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerContract.fromResponse(response);
  }

  public async stopTracker(trackerId: string): Promise<void> {
    const response = await fetch(this.buildUrl(`/api/individual-tracker/${encodeURIComponent(trackerId)}/stop`), {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    await stopTrackerContract.fromResponse(response);
  }

  public async pauseTracker(trackerId: string): Promise<TrackerResponse> {
    const response = await fetch(this.buildUrl(`/api/individual-tracker/${encodeURIComponent(trackerId)}/pause`), {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerContract.fromResponse(response);
  }

  public async resumeTracker(trackerId: string): Promise<TrackerResponse> {
    const response = await fetch(this.buildUrl(`/api/individual-tracker/${encodeURIComponent(trackerId)}/resume`), {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerContract.fromResponse(response);
  }

  public async selectActive(trackerId: string): Promise<TrackerResponse> {
    const response = await fetch(this.buildUrl("/api/individual-tracker/manage/select-active"), {
      credentials: "include",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ trackerId }),
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerContract.fromResponse(response);
  }

  public async getTrackerStatus(trackerId: string): Promise<TrackerResponse> {
    const response = await fetch(this.buildUrl(`/api/individual-tracker/${encodeURIComponent(trackerId)}/status`), {
      credentials: "include",
      method: "GET",
    });

    if (!response.ok) {
      throw await this.readError(response);
    }

    return trackerContract.fromResponse(response);
  }

  public async searchGamertag(query: string): Promise<TrackerSearchResult | null> {
    const normalized = query.trim();
    if (normalized === "") {
      return null;
    }

    let userResult: { gamertag: string; xuid: string };
    try {
      userResult = await this.haloInfiniteClient.getUser(normalized);
    } catch {
      return null;
    }

    let rankLabel: string | null = null;
    let csrLabel: string | null = null;
    let currentRankTier: string | null = null;
    let currentRankSubTier: number | null = null;
    let currentRankMeasurementMatchesRemaining: number | null = null;
    let currentRankInitialMeasurementMatches: number | null = null;
    let allTimePeakRankLabel: string | null = null;
    let allTimePeakCsrLabel: string | null = null;
    let allTimePeakRankTier: string | null = null;
    let allTimePeakRankSubTier: number | null = null;
    let seasonPeakCsrLabel: string | null = null;
    let seasonPeakRankTier: string | null = null;
    let seasonPeakRankSubTier: number | null = null;
    let matchmadeMatchCount: number | null = null;
    let customMatchCount: number | null = null;

    const [rankedArenaCsrs, matchCounts] = await Promise.allSettled([
      this.haloInfiniteClient.getPlaylistCsr(RANKED_ARENA_PLAYLIST_ID, [userResult.xuid]),
      this.haloInfiniteClient.getPlayerMatchCount(userResult.xuid),
    ]);

    if (rankedArenaCsrs.status === "fulfilled") {
      const [{ Result }] = rankedArenaCsrs.value;
      const labels = getRankAndCsrLabels(Result);
      const current = Result.Current;
      const allTimeMax = Result.AllTimeMax;
      const seasonMax = Result.SeasonMax;
      ({ rankLabel, csrLabel } = labels);
      currentRankTier = current.Tier;
      currentRankSubTier = current.SubTier;
      currentRankMeasurementMatchesRemaining = current.MeasurementMatchesRemaining;
      currentRankInitialMeasurementMatches = current.InitialMeasurementMatches;
      allTimePeakRankLabel = getRankLabel(allTimeMax.Tier, allTimeMax.SubTier);
      allTimePeakCsrLabel = getCsrLabel(allTimeMax.Value);
      allTimePeakRankTier = allTimeMax.Tier;
      allTimePeakRankSubTier = allTimeMax.SubTier;
      seasonPeakCsrLabel = getCsrLabel(seasonMax.Value);
      seasonPeakRankTier = seasonMax.Tier;
      seasonPeakRankSubTier = seasonMax.SubTier;
    }

    if (matchCounts.status === "fulfilled") {
      const count = matchCounts.value;
      matchmadeMatchCount = count.MatchmadeMatchesPlayedCount;
      customMatchCount = count.CustomMatchesPlayedCount;
    }

    return {
      gamertag: userResult.gamertag,
      xuid: userResult.xuid,
      rankLabel,
      csrLabel,
      currentRankTier,
      currentRankSubTier,
      currentRankMeasurementMatchesRemaining,
      currentRankInitialMeasurementMatches,
      allTimePeakRankLabel,
      allTimePeakCsrLabel,
      allTimePeakRankTier,
      allTimePeakRankSubTier,
      seasonPeakCsrLabel,
      seasonPeakRankTier,
      seasonPeakRankSubTier,
      matchmadeMatchCount,
      customMatchCount,
    };
  }

  public async getMatchHistory(
    xuid: string,
    start: number,
    count: number,
    category: "custom" | "all" = "all",
  ): Promise<TrackerMatchHistoryResponse> {
    const matchType = category === "custom" ? MatchType.Custom : MatchType.All;
    const recentMatches = await this.haloInfiniteClient.getPlayerMatches(xuid, matchType, count, start);
    if (recentMatches.length === 0) {
      return { matches: [], suggestedGroupings: [] };
    }

    const resolvedMatchDetails = await Promise.all(
      recentMatches.map(async (match) => ({
        matchId: match.MatchId,
        detail: await this.getMatchStats(match.MatchId),
      })),
    );

    const matchDetailsById = new Map<string, MatchStats>();
    for (const resolved of resolvedMatchDetails) {
      if (resolved.detail != null) {
        matchDetailsById.set(resolved.matchId, resolved.detail);
      }
    }

    const xuidToGamertag = await this.getGamertagsByXuid(matchDetailsById);

    const matches = await Promise.all(
      recentMatches.map(async (match) => {
        const matchStats = matchDetailsById.get(match.MatchId) ?? null;
        const playlist = match.MatchInfo.Playlist;
        const isMatchmaking = playlist != null;
        const [mapDetails, modeName, matchmakingPlaylist] = await Promise.all([
          this.getMapDetails(match.MatchInfo.MapVariant.AssetId, match.MatchInfo.MapVariant.VersionId),
          this.getModeName(match.MatchInfo.UgcGameVariant.AssetId, match.MatchInfo.UgcGameVariant.VersionId),
          playlist != null
            ? this.getMatchmakingPlaylistName(playlist.AssetId, playlist.VersionId)
            : Promise.resolve(null),
        ]);
        const outcome = getMatchOutcomeLabel(match.Outcome);
        const lifecycleMode = match.MatchInfo.LifecycleMode;
        const matchCategory: TrackerMatchHistoryEntry["category"] = isMatchmaking
          ? "matchmaking"
          : lifecycleMode === 0
            ? "local"
            : lifecycleMode === 1
              ? "custom"
              : "unknown";

        return {
          matchId: match.MatchId,
          startTime: formatDisplayDateTime(match.MatchInfo.StartTime),
          endTime: formatDisplayDateTime(match.MatchInfo.EndTime),
          mapAssetId: match.MatchInfo.MapVariant.AssetId,
          mapVersionId: match.MatchInfo.MapVariant.VersionId,
          modeAssetId: match.MatchInfo.UgcGameVariant.AssetId,
          modeVersionId: match.MatchInfo.UgcGameVariant.VersionId,
          gameVariantCategory: match.MatchInfo.GameVariantCategory,
          startTimeIso: match.MatchInfo.StartTime,
          endTimeIso: match.MatchInfo.EndTime,
          duration: getReadableDuration(match.MatchInfo.Duration),
          mapName: mapDetails.name,
          modeName,
          outcome,
          resultString: buildMatchResultString(outcome, matchStats),
          isMatchmaking,
          ...(matchmakingPlaylist != null ? { matchmakingPlaylist } : {}),
          category: matchCategory,
          teams: buildTeams(matchStats, xuidToGamertag),
          mapThumbnailUrl: mapDetails.thumbnailUrl,
        } satisfies TrackerMatchHistoryEntry;
      }),
    );

    const autoGroupingEntries = matches.map((match) => {
      const stats = matchDetailsById.get(match.matchId) ?? null;
      return {
        matchId: match.matchId,
        isMatchmaking: match.isMatchmaking,
        teamRosterSignature: stats != null ? buildTeamRosterSignature(stats) : null,
      };
    });

    const suggestedGroupings = analyzeMatchGroupings(autoGroupingEntries);

    return { matches, suggestedGroupings };
  }

  public async syncMatchesToTracker(request: TrackerSyncMatchesRequest): Promise<void> {
    const response = await fetch(
      this.buildUrl(`/api/individual-tracker/manage/${encodeURIComponent(request.trackerId)}/matches`),
      {
        credentials: "include",
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchIds: request.selectedMatchIds,
          seriesGroups: request.seriesGroups ?? [],
        }),
      },
    );

    if (!response.ok) {
      throw await this.readError(response);
    }

    await selectMatchesContract.fromResponse(response);
  }

  public async startSeries(request: StartSeriesRequest): Promise<StartSeriesResponse> {
    const response = await fetch(
      this.buildUrl(`/api/individual-tracker/${encodeURIComponent(request.trackerId)}/start-series`),
      {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titleOverride: request.titleOverride,
          subtitleOverride: request.subtitleOverride,
          teams: request.teams,
          ...(request.matchIds != null && request.matchIds.length > 0 ? { matchIds: [...request.matchIds] } : {}),
        }),
      },
    );

    if (!response.ok) {
      throw await this.readError(response);
    }

    return response.json<StartSeriesResponse>();
  }

  private async getMatchStats(matchId: string): Promise<MatchStats | null> {
    try {
      return await this.haloInfiniteClient.getMatchStats(matchId);
    } catch {
      return null;
    }
  }

  private async getGamertagsByXuid(matchDetailsById: ReadonlyMap<string, MatchStats>): Promise<Map<string, string>> {
    const xuids = new Set<string>();
    for (const stats of matchDetailsById.values()) {
      for (const player of stats.Players) {
        if (player.PlayerType === 1) {
          xuids.add(getPlayerXuid(player));
        }
      }
    }

    if (xuids.size === 0) {
      return new Map();
    }

    const xuidList = Array.from(xuids);
    const chunks: string[][] = [];
    for (let i = 0; i < xuidList.length; i += XUID_BATCH_SIZE) {
      chunks.push(xuidList.slice(i, i + XUID_BATCH_SIZE));
    }

    const results = await Promise.allSettled(chunks.map(async (chunk) => this.haloInfiniteClient.getUsers(chunk)));
    const map = new Map<string, string>();
    for (const result of results) {
      if (result.status === "fulfilled") {
        for (const user of result.value) {
          map.set(user.xuid, user.gamertag);
        }
      }
    }
    return map;
  }

  private async getMapDetails(assetId: string, versionId: string): Promise<{ name: string; thumbnailUrl: string }> {
    const key = `${assetId}:${versionId}`;
    const existing = this.mapCache.get(key);
    if (existing != null) {
      return existing.then((asset) => ({
        name: asset.PublicName,
        thumbnailUrl: getMapThumbnailUrl(asset),
      }));
    }

    const promise = this.haloInfiniteClient
      .getSpecificAssetVersion(AssetKind.Map, assetId, versionId)
      .catch((error: unknown) => {
        this.mapCache.delete(key);
        throw error;
      });
    this.mapCache.set(key, promise);

    const asset = await promise;
    return { name: asset.PublicName, thumbnailUrl: getMapThumbnailUrl(asset) };
  }

  private async getModeName(assetId: string, versionId: string): Promise<string> {
    const key = `${assetId}:${versionId}`;
    const existing = this.modeNameCache.get(key);
    if (existing != null) {
      return existing.then((variant) => variant.PublicName);
    }

    const promise = this.haloInfiniteClient
      .getSpecificAssetVersion(AssetKind.UgcGameVariant, assetId, versionId)
      .catch((error: unknown) => {
        this.modeNameCache.delete(key);
        throw error;
      });
    this.modeNameCache.set(key, promise);
    const variant = await promise;
    return variant.PublicName;
  }

  private async getMatchmakingPlaylistName(
    assetId: string | undefined,
    versionId: string | undefined,
  ): Promise<string | null> {
    if (assetId == null || versionId == null) {
      return null;
    }

    const key = `${assetId}:${versionId}`;
    const existing = this.playlistNameCache.get(key);
    if (existing != null) {
      return existing;
    }

    const promise = this.haloInfiniteClient
      .getSpecificAssetVersion(AssetKind.Playlist, assetId, versionId)
      .then((asset) => {
        const playlistName = asset.PublicName.trim();
        return playlistName === "" ? null : playlistName;
      })
      .catch(() => {
        this.playlistNameCache.delete(key);
        return null;
      });

    this.playlistNameCache.set(key, promise);
    return promise;
  }

  public async getTrackers(): Promise<TrackerListResponse> {
    const { trackers } = await this.listTrackers();
    return {
      trackers: trackers.map((t) => ({ trackerId: t.trackerId, gamertag: t.gamertag, xuid: t.xuid })),
      statuses: Object.fromEntries(trackers.map((t) => [t.trackerId, t.state ?? null])),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async getActiveTrackerState(_xuid: string): Promise<TrackerStatusResponse> {
    const { trackers } = await this.listTrackers();
    const live = trackers.find((t) => t.isLive);
    return { activeTracker: live?.state ?? null };
  }

  public async deleteTracker(trackerId: string): Promise<void> {
    const response = await fetch(this.buildUrl(`/api/individual-tracker/${encodeURIComponent(trackerId)}`), {
      credentials: "include",
      method: "DELETE",
    });
    if (!response.ok) {
      throw await this.readError(response);
    }
  }

  public async endSeries(trackerId: string): Promise<void> {
    const response = await fetch(this.buildUrl(`/api/individual-tracker/${encodeURIComponent(trackerId)}/end-series`), {
      credentials: "include",
      method: "POST",
    });
    if (!response.ok) {
      throw await this.readError(response);
    }
  }

  public async editSeries(trackerId: string, request: EditSeriesRequest): Promise<void> {
    const response = await fetch(
      this.buildUrl(`/api/individual-tracker/manage/${encodeURIComponent(trackerId)}/series`),
      {
        credentials: "include",
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      },
    );
    if (!response.ok) {
      throw await this.readError(response);
    }
  }

  public async resumeSeries(trackerId: string): Promise<void> {
    const response = await fetch(
      this.buildUrl(`/api/individual-tracker/manage/${encodeURIComponent(trackerId)}/resume-series`),
      {
        credentials: "include",
        method: "POST",
      },
    );
    if (!response.ok) {
      throw await this.readError(response);
    }
  }

  public async refreshTracker(trackerId: string): Promise<void> {
    const response = await fetch(
      this.buildUrl(`/api/individual-tracker/manage/${encodeURIComponent(trackerId)}/refresh`),
      {
        credentials: "include",
        method: "POST",
      },
    );
    if (!response.ok) {
      throw await this.readError(response);
    }
    await refreshTrackerContract.fromResponse(response);
  }

  public connectToTracker(_userId: string, trackerId: string): IndividualTrackerConnection {
    const apiUrl = new URL(this.apiHost);
    const protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${apiUrl.host}/api/individual-tracker/${encodeURIComponent(trackerId)}/ws`;

    const ws = new WebSocket(wsUrl);
    const conn = new RealTrackerViewConnection(ws);

    conn.handleStatus("connecting");
    ws.onopen = (): void => {
      conn.handleStatus("connected");
    };
    ws.onmessage = (event: MessageEvent): void => {
      if (typeof event.data === "string") {
        conn.handleRaw(event.data);
      }
    };
    ws.onerror = (): void => {
      conn.handleStatus("error");
    };
    ws.onclose = (event: CloseEvent): void => {
      if (event.code === 1000 && event.reason === "Tracker stopped") {
        conn.handleStatus("stopped");
        return;
      }
      conn.handleStatus(event.code === 1000 ? "disconnected" : "error", event.reason || undefined);
    };

    return {
      subscribe: (listener) => conn.subscribe(listener),
      subscribeStatus: (listener) => conn.subscribeStatus(listener),
      disconnect: (): void => {
        conn.disconnect();
      },
    };
  }
}
