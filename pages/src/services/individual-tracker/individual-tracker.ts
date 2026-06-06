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
import { buildMatchResultString, buildTeams, formatDisplayDateTime, getMapThumbnailUrl } from "./match-history-helpers";
import type {
  IndividualTrackerService,
  TrackerMatchHistoryEntry,
  TrackerMatchHistoryResponse,
  TrackerSearchResult,
  TrackerSyncMatchesRequest,
} from "./types";

interface IndividualTrackerServiceOpts {
  readonly apiHost: string;
  readonly haloInfiniteClient: HaloInfiniteClient;
}

export class RealIndividualTrackerService implements IndividualTrackerService {
  private readonly apiHost: string;
  private readonly haloInfiniteClient: HaloInfiniteClient;
  private readonly mapCache = new Map<string, Promise<MapAsset>>();
  private readonly modeNameCache = new Map<string, Promise<UgcGameVariantAsset>>();

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

    const url = this.buildUrl(`/api/individual-tracker/manage/search-gamertag?q=${encodeURIComponent(normalized)}`);
    const response = await fetch(url, {
      credentials: "include",
      method: "GET",
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw await this.readError(response);
    }

    return await response.json();
  }

  public async getMatchHistory(xuid: string, start: number, count: number): Promise<TrackerMatchHistoryResponse> {
    const recentMatches = await this.haloInfiniteClient.getPlayerMatches(xuid, MatchType.All, count, start);
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
        const mapDetails = await this.getMapDetails(
          match.MatchInfo.MapVariant.AssetId,
          match.MatchInfo.MapVariant.VersionId,
        );
        const modeName = await this.getModeName(
          match.MatchInfo.UgcGameVariant.AssetId,
          match.MatchInfo.UgcGameVariant.VersionId,
        );
        const outcome = getMatchOutcomeLabel(match.Outcome);
        const isMatchmaking = match.MatchInfo.Playlist != null;
        const lifecycleMode = match.MatchInfo.LifecycleMode;
        const category: TrackerMatchHistoryEntry["category"] = isMatchmaking
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
          category,
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
        body: JSON.stringify({ matchIds: request.selectedMatchIds }),
      },
    );

    if (!response.ok) {
      throw await this.readError(response);
    }

    await selectMatchesContract.fromResponse(response);
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

    try {
      const users = await this.haloInfiniteClient.getUsers(Array.from(xuids));
      const map = new Map<string, string>();
      for (const user of users) {
        map.set(user.xuid, user.gamertag);
      }
      return map;
    } catch {
      return new Map();
    }
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

    const promise = this.haloInfiniteClient.getAsset(AssetKind.Map, assetId).catch((error: unknown) => {
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

    const promise = this.haloInfiniteClient.getAsset(AssetKind.UgcGameVariant, assetId).catch((error: unknown) => {
      this.modeNameCache.delete(key);
      throw error;
    });
    this.modeNameCache.set(key, promise);
    const variant = await promise;
    return variant.PublicName;
  }
}
