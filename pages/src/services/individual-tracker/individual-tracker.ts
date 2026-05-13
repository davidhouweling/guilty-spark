import { isRecord, isString, isNumber } from "@guilty-spark/shared/base/json-readers";
import {
  type HaloInfiniteClient,
  type MatchStats,
  type MapAsset,
  type PlaylistCsrContainer,
  type UgcGameVariantAsset,
  type UserInfo,
  AssetKind,
  MatchType,
} from "halo-infinite-api";
import { getReadableDuration } from "@guilty-spark/shared/halo/duration";
import {
  createMedalLookup,
  getMedalFromLookup,
  getMedalMetadataFromMatches,
  type MedalLookup,
  type MedalMetadata,
} from "@guilty-spark/shared/halo/medals";
import {
  sanitizeMapName,
  normalizeModeName,
  getMatchOutcomeLabel,
  buildMatchResultString,
  buildTeams,
  analyzeMatchGroupings,
} from "@guilty-spark/shared/halo/match-enrichment";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { StreamerViewColorMode } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type {
  IndividualTrackerState,
  IndividualTrackerStateMessage,
} from "@guilty-spark/shared/individual-tracker/types";
import type {
  IndividualTrackerConnection,
  IndividualTrackerConnectionStatus,
  IndividualTrackerCreateProfileRequest,
  IndividualTrackerCreateProfileResponse,
  IndividualTrackerGame,
  IndividualTrackerGamesResponse,
  IndividualTrackerStreamerViewSettings,
  IndividualTrackerStateListener,
  IndividualTrackerStatusListener,
  IndividualTrackerSubscription,
  IndividualTrackerMutateGamesRequest,
  IndividualTrackerUpdateStreamerViewSettingsRequest,
  PauseTrackerResponse,
  RefreshTrackerResponse,
  ResumeTrackerResponse,
  StartTrackerRequest,
  StartTrackerResponse,
  StopTrackerResponse,
  TrackerSyncMatchesRequest,
  TrackerSeriesGroupUpdateRequest,
  TrackerMatchHistoryEntry,
  TrackerMatchHistoryResponse,
  TrackerListResponse,
  TrackerSearchResult,
  TrackerStatusResponse,
  ActiveTrackerViewResponse,
  IndividualTrackerService,
  IndividualTrackerProfile,
  IndividualTrackerProfileResponse,
  IndividualTrackerReorderGamesRequest,
  IndividualTrackerUpdateProfileRequest,
  IndividualTrackerUpdateProfileResponse,
} from "./types";

function parseStreamerViewColorMode(value: unknown): StreamerViewColorMode | null {
  if (value === "player" || value === "observer") {
    return value;
  }

  return null;
}

interface IndividualTrackerServiceOpts {
  readonly apiHost: string;
  readonly haloInfiniteClient: HaloInfiniteClient;
}

const RANKED_ARENA_PLAYLIST_ID = "edfef3ac-9cbe-4fa2-b949-8f29deafd483";

function getRankLabel(tier: string, subTier: number): string {
  if (tier === "Onyx") {
    return tier;
  }

  // Halo API SubTier is zero-indexed for non-Onyx tiers (0..5 -> 1..6 for display).
  return `${tier} ${(subTier + 1).toString()}`;
}

function getRankAndCsrLabels(csr: PlaylistCsrContainer): { rankLabel: string | null; csrLabel: string | null } {
  const currentCsr = csr.Current;

  const csrLabel = currentCsr.Value >= 0 ? currentCsr.Value.toString() : "-";
  const rankLabel = currentCsr.MeasurementMatchesRemaining > 0 ? "Unranked" : getRankLabel(currentCsr.Tier, currentCsr.SubTier);

  return { rankLabel, csrLabel };
}

function getCsrLabel(value: number): string | null {
  return value >= 0 ? value.toString() : "-";
}

async function resolveCached<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  const existing = cache.get(key);
  if (existing != null) {
    return existing;
  }

  const created = load().catch((error: unknown) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, created);
  return created;
}

function formatDisplayDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: true,
  }).format(date);
}

function getMapThumbnailUrl(asset: MapAsset): string {
  const thumbnailFile = asset.Files.FileRelativePaths.find((file) => file.includes("thumbnail"));
  if (thumbnailFile != null) {
    return `${asset.Files.Prefix}${thumbnailFile}`;
  }

  const heroFile = asset.Files.FileRelativePaths.find((file) => file.includes("hero"));
  if (heroFile != null) {
    return `${asset.Files.Prefix}${heroFile}`;
  }

  return "data:,";
}

function buildPlayerXuidToGamertag(
  matchStats: MatchStats | null,
  xuidToGamertag: ReadonlyMap<string, string>,
): Record<string, string> {
  const playerMap: Record<string, string> = {};
  if (matchStats == null) {
    return playerMap;
  }

  for (const player of matchStats.Players) {
    const xuid = getPlayerXuid(player);
    const gamertag = xuidToGamertag.get(xuid);
    if (gamertag != null) {
      playerMap[xuid] = gamertag;
    }
  }

  return playerMap;
}

function parseProfile(value: unknown): IndividualTrackerProfile | null {
  if (value === null) {
    return null;
  }

  if (!isRecord(value)) {
    throw new Error("Invalid profile payload");
  }

  const profileId = value.ProfileId;
  const userId = value.UserId;
  const activeIdentityId = value.ActiveIdentityId;
  const name = value.Name;
  const createdAt = value.CreatedAt;
  const updatedAt = value.UpdatedAt;

  if (!isString(profileId) || !isString(userId) || !isString(name) || !isNumber(createdAt) || !isNumber(updatedAt)) {
    throw new Error("Invalid profile payload");
  }

  if (activeIdentityId !== null && !isString(activeIdentityId)) {
    throw new Error("Invalid profile payload");
  }

  return {
    ProfileId: profileId,
    UserId: userId,
    ActiveIdentityId: activeIdentityId,
    Name: name,
    CreatedAt: createdAt,
    UpdatedAt: updatedAt,
  };
}

function parseGame(value: unknown): IndividualTrackerGame {
  if (!isRecord(value)) {
    throw new Error("Invalid game payload");
  }

  const profileId = value.ProfileId;
  const matchId = value.MatchId;
  const position = value.Position;
  const included = value.Included;
  const annotationsJson = value.AnnotationsJson;
  const createdAt = value.CreatedAt;
  const updatedAt = value.UpdatedAt;

  if (!isString(profileId) || !isString(matchId) || !isNumber(position) || !isString(annotationsJson)) {
    throw new Error("Invalid game payload");
  }

  if (included !== 0 && included !== 1) {
    throw new Error("Invalid game payload");
  }

  if (!isNumber(createdAt) || !isNumber(updatedAt)) {
    throw new Error("Invalid game payload");
  }

  return {
    ProfileId: profileId,
    MatchId: matchId,
    Position: position,
    Included: included,
    AnnotationsJson: annotationsJson,
    CreatedAt: createdAt,
    UpdatedAt: updatedAt,
  };
}

function parseGames(value: unknown): IndividualTrackerGame[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid games payload");
  }

  return value.map((game) => parseGame(game));
}

function parseProfileResponse(value: unknown): IndividualTrackerProfileResponse {
  if (!isRecord(value)) {
    throw new Error("Invalid profile response");
  }

  return {
    profile: parseProfile(value.profile),
    games: parseGames(value.games),
  };
}

function parseCreateProfileResponse(value: unknown): IndividualTrackerCreateProfileResponse {
  if (!isRecord(value)) {
    throw new Error("Invalid create profile response");
  }

  const profile = parseProfile(value.profile);
  if (profile === null) {
    throw new Error("Invalid create profile response");
  }

  return { profile };
}

function parseUpdateProfileResponse(value: unknown): IndividualTrackerUpdateProfileResponse {
  if (!isRecord(value)) {
    throw new Error("Invalid update profile response");
  }

  const profile = parseProfile(value.profile);
  if (profile === null) {
    throw new Error("Invalid update profile response");
  }

  return { profile };
}

function parseGamesResponse(value: unknown): IndividualTrackerGamesResponse {
  if (!isRecord(value)) {
    throw new Error("Invalid games response");
  }

  return {
    games: parseGames(value.games),
  };
}

function parseStreamerViewSettings(value: unknown): IndividualTrackerStreamerViewSettings {
  if (!isRecord(value)) {
    throw new Error("Invalid streamer view settings response");
  }

  const { profileId } = value;
  const { layoutOptions } = value;
  const { visibleSections } = value;
  const { styleFlags } = value;
  const { effectiveDefaults } = value;
  const { updatedAt } = value;

  if (
    !isString(profileId) ||
    !isRecord(layoutOptions) ||
    !isRecord(visibleSections) ||
    !isRecord(styleFlags) ||
    !isRecord(effectiveDefaults)
  ) {
    throw new Error("Invalid streamer view settings response");
  }

  const effectiveColorMode = parseStreamerViewColorMode(effectiveDefaults.colorMode);
  if (effectiveColorMode == null) {
    throw new Error("Invalid streamer view settings response");
  }

  const layoutViewMode =
    layoutOptions.viewMode === "standard" || layoutOptions.viewMode === "wide" || layoutOptions.viewMode === "streamer"
      ? layoutOptions.viewMode
      : null;
  const layoutDefaultColorMode = parseStreamerViewColorMode(layoutOptions.defaultColorMode);
  const visibleShowTicker = typeof visibleSections.showTicker === "boolean" ? visibleSections.showTicker : null;
  const visibleShowTabs = typeof visibleSections.showTabs === "boolean" ? visibleSections.showTabs : null;
  const visibleShowTeamDetails =
    typeof visibleSections.showTeamDetails === "boolean" ? visibleSections.showTeamDetails : null;
  const styleColorMode = parseStreamerViewColorMode(styleFlags.colorMode);
  const stylePlayerTeamColor = typeof styleFlags.playerTeamColor === "string" ? styleFlags.playerTeamColor : null;
  const stylePlayerEnemyColor = typeof styleFlags.playerEnemyColor === "string" ? styleFlags.playerEnemyColor : null;
  const styleObserverTeamColor = typeof styleFlags.observerTeamColor === "string" ? styleFlags.observerTeamColor : null;
  const styleObserverEnemyColor =
    typeof styleFlags.observerEnemyColor === "string" ? styleFlags.observerEnemyColor : null;
  const styleTeamColor = typeof styleFlags.teamColor === "string" ? styleFlags.teamColor : null;
  const styleEnemyColor = typeof styleFlags.enemyColor === "string" ? styleFlags.enemyColor : null;
  const styleObserverOverridesRecord =
    styleFlags.observerColorOverrides != null &&
    typeof styleFlags.observerColorOverrides === "object" &&
    !Array.isArray(styleFlags.observerColorOverrides)
      ? (styleFlags.observerColorOverrides as Record<string, unknown>)
      : null;
  const styleObserverOverrides =
    styleObserverOverridesRecord == null
      ? null
      : Object.fromEntries(
          Object.entries(styleObserverOverridesRecord)
            .filter((entry): entry is [string, Record<string, unknown>] => {
              const [, overrideValue] = entry;
              return overrideValue != null && typeof overrideValue === "object" && !Array.isArray(overrideValue);
            })
            .map(([trackerId, overrideValue]) => {
              const teamColor = typeof overrideValue.teamColor === "string" ? overrideValue.teamColor : null;
              const enemyColor = typeof overrideValue.enemyColor === "string" ? overrideValue.enemyColor : null;

              return [
                trackerId,
                {
                  ...(teamColor == null ? {} : { teamColor }),
                  ...(enemyColor == null ? {} : { enemyColor }),
                },
              ] as const;
            })
            .filter(([, overrideData]) => overrideData.teamColor != null || overrideData.enemyColor != null),
        );

  if (updatedAt !== null && !isNumber(updatedAt)) {
    throw new Error("Invalid streamer view settings response");
  }

  return {
    profileId,
    layoutOptions: {
      ...(layoutViewMode == null ? {} : { viewMode: layoutViewMode }),
      ...(layoutDefaultColorMode == null ? {} : { defaultColorMode: layoutDefaultColorMode }),
    },
    visibleSections: {
      ...(visibleShowTicker == null ? {} : { showTicker: visibleShowTicker }),
      ...(visibleShowTabs == null ? {} : { showTabs: visibleShowTabs }),
      ...(visibleShowTeamDetails == null ? {} : { showTeamDetails: visibleShowTeamDetails }),
    },
    styleFlags: {
      ...(styleColorMode == null ? {} : { colorMode: styleColorMode }),
      ...(stylePlayerTeamColor == null ? {} : { playerTeamColor: stylePlayerTeamColor }),
      ...(stylePlayerEnemyColor == null ? {} : { playerEnemyColor: stylePlayerEnemyColor }),
      ...(styleObserverTeamColor == null ? {} : { observerTeamColor: styleObserverTeamColor }),
      ...(styleObserverEnemyColor == null ? {} : { observerEnemyColor: styleObserverEnemyColor }),
      ...(styleTeamColor == null ? {} : { teamColor: styleTeamColor }),
      ...(styleEnemyColor == null ? {} : { enemyColor: styleEnemyColor }),
      ...(styleObserverOverrides == null || Object.keys(styleObserverOverrides).length === 0
        ? {}
        : { observerColorOverrides: styleObserverOverrides }),
    },
    effectiveDefaults: {
      colorMode: effectiveColorMode,
    },
    updatedAt,
  };
}

class RealIndividualTrackerConnection implements IndividualTrackerConnection {
  private readonly stateListeners = new Set<IndividualTrackerStateListener>();
  private readonly statusListeners = new Set<IndividualTrackerStatusListener>();
  private ws: WebSocket | null;
  private readonly onOffline: () => void;

  public constructor(ws: WebSocket) {
    this.ws = ws;
    this.onOffline = (): void => {
      this.ws?.close();
    };
    window.addEventListener("offline", this.onOffline);
  }

  public subscribe(listener: IndividualTrackerStateListener): IndividualTrackerSubscription {
    this.stateListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.stateListeners.delete(listener);
      },
    };
  }

  public subscribeStatus(listener: IndividualTrackerStatusListener): IndividualTrackerSubscription {
    this.statusListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.statusListeners.delete(listener);
      },
    };
  }

  public disconnect(): void {
    window.removeEventListener("offline", this.onOffline);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.stateListeners.clear();
    this.statusListeners.clear();
  }

  public handleStatus(status: IndividualTrackerConnectionStatus, detail?: string): void {
    for (const listener of this.statusListeners) {
      listener(status, detail);
    }
  }

  public handleStateMessage(state: IndividualTrackerState): void {
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }

  public attachWebSocket(ws: WebSocket): void {
    this.ws = ws;
    this.onWebSocketSetup(ws);
  }

  private onWebSocketSetup(ws: WebSocket): void {
    ws.addEventListener("open", () => {
      this.handleStatus("connected");
    });

    ws.addEventListener("message", (event: MessageEvent<string>) => {
      try {
        const parsed: unknown = JSON.parse(event.data);
        if (
          parsed != null &&
          typeof parsed === "object" &&
          "type" in parsed &&
          "data" in parsed &&
          (parsed as { type: unknown }).type === "state"
        ) {
          const message = parsed as IndividualTrackerStateMessage;
          const { status } = message.data;
          if (status === "stopped") {
            this.handleStatus("stopped");
          }
          this.handleStateMessage(message.data);
        }
      } catch {
        // ignore unparseable messages
      }
    });

    ws.addEventListener("close", (event: CloseEvent) => {
      if (event.code === 1000) {
        this.handleStatus("stopped");
      } else {
        this.handleStatus("disconnected", event.reason);
      }
    });

    ws.addEventListener("error", () => {
      this.handleStatus("error", "WebSocket connection failed");
    });
  }
}

export class RealIndividualTrackerService implements IndividualTrackerService {
  private readonly apiHost: string;
  private readonly haloInfiniteClient: HaloInfiniteClient;
  private readonly mapAssetCache = new Map<string, Promise<MapAsset | null>>();
  private readonly modeAssetCache = new Map<string, Promise<UgcGameVariantAsset | null>>();
  private readonly matchStatsCache = new Map<string, Promise<MatchStats | null>>();
  private readonly gamertagCache = new Map<string, string>();
  private medalLookupCache: Promise<MedalLookup> | null = null;

  constructor({ apiHost, haloInfiniteClient }: IndividualTrackerServiceOpts) {
    this.apiHost = apiHost;
    this.haloInfiniteClient = haloInfiniteClient;
  }

  private buildUrl(path: string): string {
    const baseUrl = this.apiHost.endsWith("/") ? this.apiHost.slice(0, -1) : this.apiHost;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
  }

  private async fetchJson(path: string, init?: RequestInit): Promise<unknown> {
    const headers = new Headers(init?.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(this.buildUrl(path), {
      credentials: "include",
      ...init,
      headers,
    });

    if (!response.ok) {
      const reason = await response.text();
      throw new Error(reason === "" ? "Request failed (" + String(response.status) + ")" : reason);
    }

    return response.json();
  }

  async getProfile(): Promise<IndividualTrackerProfileResponse> {
    const payload = await this.fetchJson("/api/individual-tracker/profile", { method: "GET" });
    return parseProfileResponse(payload);
  }

  async createProfile(request: IndividualTrackerCreateProfileRequest): Promise<IndividualTrackerCreateProfileResponse> {
    const payload = await this.fetchJson("/api/individual-tracker/profile", {
      method: "POST",
      body: JSON.stringify(request),
    });

    return parseCreateProfileResponse(payload);
  }

  async updateProfile(request: IndividualTrackerUpdateProfileRequest): Promise<IndividualTrackerUpdateProfileResponse> {
    const payload = await this.fetchJson("/api/individual-tracker/profile", {
      method: "PATCH",
      body: JSON.stringify(request),
    });

    return parseUpdateProfileResponse(payload);
  }

  async getStreamerViewSettings(profileId: string): Promise<IndividualTrackerStreamerViewSettings> {
    const payload = await this.fetchJson(
      `/api/individual-tracker/streamer-view?profileId=${encodeURIComponent(profileId)}`,
      {
        method: "GET",
      },
    );

    return parseStreamerViewSettings(payload);
  }

  async updateStreamerViewSettings(
    request: IndividualTrackerUpdateStreamerViewSettingsRequest,
  ): Promise<IndividualTrackerStreamerViewSettings> {
    const payload = await this.fetchJson("/api/individual-tracker/streamer-view", {
      method: "PATCH",
      body: JSON.stringify(request),
    });

    return parseStreamerViewSettings(payload);
  }

  async addGame(request: IndividualTrackerMutateGamesRequest): Promise<IndividualTrackerGamesResponse> {
    const payload = await this.fetchJson("/api/individual-tracker/games:add", {
      method: "POST",
      body: JSON.stringify(request),
    });

    return parseGamesResponse(payload);
  }

  async removeGame(request: IndividualTrackerMutateGamesRequest): Promise<IndividualTrackerGamesResponse> {
    const payload = await this.fetchJson("/api/individual-tracker/games:remove", {
      method: "POST",
      body: JSON.stringify(request),
    });

    return parseGamesResponse(payload);
  }

  async reorderGames(request: IndividualTrackerReorderGamesRequest): Promise<IndividualTrackerGamesResponse> {
    const payload = await this.fetchJson("/api/individual-tracker/games:reorder", {
      method: "POST",
      body: JSON.stringify(request),
    });

    return parseGamesResponse(payload);
  }

  public async startTracker(opts: StartTrackerRequest): Promise<StartTrackerResponse> {
    const response = await fetch(`${this.apiHost}/api/individual-tracker/manage/start`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });

    return response.json<StartTrackerResponse>();
  }

  public async stopTracker(trackerId: string): Promise<StopTrackerResponse> {
    const response = await fetch(`${this.apiHost}/api/individual-tracker/${encodeURIComponent(trackerId)}/stop`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    return response.json<StopTrackerResponse>();
  }

  public async pauseTracker(trackerId: string): Promise<PauseTrackerResponse> {
    const response = await fetch(`${this.apiHost}/api/individual-tracker/${encodeURIComponent(trackerId)}/pause`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    return response.json<PauseTrackerResponse>();
  }

  public async resumeTracker(trackerId: string): Promise<ResumeTrackerResponse> {
    const response = await fetch(`${this.apiHost}/api/individual-tracker/${encodeURIComponent(trackerId)}/resume`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    return response.json<ResumeTrackerResponse>();
  }

  public async refreshTracker(trackerId: string): Promise<RefreshTrackerResponse> {
    const response = await fetch(`${this.apiHost}/api/individual-tracker/${encodeURIComponent(trackerId)}/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    return response.json<RefreshTrackerResponse>();
  }

  public async selectLiveTracker(trackerId: string): Promise<void> {
    await fetch(`${this.apiHost}/api/individual-tracker/manage/select-active`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackerId }),
    });
  }

  public async deleteTracker(trackerId: string): Promise<void> {
    await fetch(`${this.apiHost}/api/individual-tracker/${encodeURIComponent(trackerId)}`, {
      method: "DELETE",
      credentials: "include",
    });
  }

  public async searchGamertag(query: string): Promise<TrackerSearchResult | null> {
    const normalized = query.trim();
    if (normalized === "") {
      return null;
    }

    const userResult = await this.haloInfiniteClient.getUser(normalized);

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

  public async getMatchHistory(xuid: string, start: number, count: number): Promise<TrackerMatchHistoryResponse> {
    const recentMatches = await this.haloInfiniteClient.getPlayerMatches(xuid, MatchType.All, count, start);
    if (recentMatches.length === 0) {
      return {
        matches: [],
        suggestedGroupings: [],
      };
    }

    const resolvedMatchDetails = await Promise.all(
      recentMatches.map(async (match) => ({
        matchId: match.MatchId,
        detail: await this.getMatchStats(match.MatchId),
      })),
    );

    const matchDetailsById = new Map<string, MatchStats>();
    for (const resolvedMatch of resolvedMatchDetails) {
      if (resolvedMatch.detail != null) {
        matchDetailsById.set(resolvedMatch.matchId, resolvedMatch.detail);
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
        const gameplayInteraction = match.MatchInfo.LifecycleMode;
        const category = isMatchmaking
          ? "matchmaking"
          : gameplayInteraction === 0
            ? "local"
            : gameplayInteraction === 1
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
          gameType: modeName,
          gameMap: mapDetails.name,
          gameTypeAndMap: `${modeName}: ${mapDetails.name}`,
          outcome,
          resultString: buildMatchResultString(outcome, matchStats),
          isMatchmaking,
          category,
          teams: buildTeams(matchStats, xuidToGamertag),
          rawMatchStats: matchStats,
          playerXuidToGametag: buildPlayerXuidToGamertag(matchStats, xuidToGamertag),
          mapThumbnailUrl: mapDetails.thumbnailUrl,
        } satisfies TrackerMatchHistoryEntry;
      }),
    );

    return {
      matches,
      suggestedGroupings: analyzeMatchGroupings(matches, matchDetailsById),
    };
  }

  public async getMedalMetadata(matches: readonly MatchStats[]): Promise<MedalMetadata> {
    if (matches.length === 0) {
      return {};
    }

    const medalLookup = await this.getMedalLookup();
    const rawMatches = Object.fromEntries(matches.map((match) => [match.MatchId, match]));

    return getMedalMetadataFromMatches(rawMatches, async (medalId) => {
      const medal = getMedalFromLookup(medalLookup, medalId);
      if (medal == null) {
        return Promise.resolve(undefined);
      }

      return Promise.resolve({
        name: medal.name,
        sortingWeight: medal.sortingWeight,
      });
    });
  }

  public async syncMatchesToTracker(request: TrackerSyncMatchesRequest): Promise<void> {
    const selectedMatchIdSet = new Set(request.selectedMatchIds);
    const filteredGroupings = request.matchGroupings
      .map((group) => group.filter((matchId) => selectedMatchIdSet.has(matchId)))
      .filter((group) => group.length >= 2);

    const matchSummaries = request.matches
      .filter((match) => selectedMatchIdSet.has(match.matchId))
      .map((match) => ({
        matchId: match.matchId,
        startTime: match.startTimeIso ?? match.startTime,
        endTime: match.endTimeIso ?? match.endTime,
        mapAssetId: match.mapAssetId,
        mapVersionId: match.mapVersionId,
        modeAssetId: match.modeAssetId,
        modeVersionId: match.modeVersionId,
        gameVariantCategory: match.gameVariantCategory,
      }));

    const response = await fetch(
      `${this.apiHost}/api/individual-tracker/${encodeURIComponent(request.trackerId)}/games-sync`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedMatchIds: request.selectedMatchIds,
          matchGroupings: filteredGroupings,
          matchSummaries,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }
  }

  public async updateSeriesGroup(request: TrackerSeriesGroupUpdateRequest): Promise<IndividualTrackerState> {
    const response = await fetch(
      `${this.apiHost}/api/individual-tracker/${encodeURIComponent(request.trackerId)}/series-groups-update`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchIds: request.matchIds,
          titleOverride: request.titleOverride,
          subtitleOverride: request.subtitleOverride,
        }),
      },
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json<{ success: true; state: IndividualTrackerState }>();
    return data.state;
  }

  public async addMatchToTracker(trackerId: string, matchId: string): Promise<void> {
    const response = await fetch(`${this.apiHost}/api/individual-tracker/${encodeURIComponent(trackerId)}/games:add`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }
  }

  public async removeMatchFromTracker(trackerId: string, matchId: string): Promise<void> {
    const response = await fetch(
      `${this.apiHost}/api/individual-tracker/${encodeURIComponent(trackerId)}/games:remove`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId }),
      },
    );

    if (!response.ok) {
      throw new Error(await response.text());
    }
  }

  public async getTrackers(userId: string): Promise<TrackerListResponse> {
    const listResponse = await fetch(
      `${this.apiHost}/api/individual-tracker/manage/${encodeURIComponent(userId)}/trackers`,
    );
    const list = await listResponse.json<{ trackers: TrackerListResponse["trackers"] }>();

    const trackerIds = list.trackers.map((t) => t.trackerId);
    const statuses = await this.getTrackerStatuses(userId, trackerIds);

    return { trackers: list.trackers, statuses };
  }

  private async getTrackerStatuses(
    userId: string,
    trackerIds: readonly string[],
  ): Promise<Record<string, IndividualTrackerState | null>> {
    if (trackerIds.length === 0) {
      return {};
    }

    const params = new URLSearchParams({ trackerIds: trackerIds.join(",") });

    const response = await fetch(
      `${this.apiHost}/api/individual-tracker/manage/${encodeURIComponent(userId)}/statuses?${params.toString()}`,
    );

    const data = await response.json<{ statuses: Record<string, IndividualTrackerState | null> }>();
    return data.statuses;
  }

  private async getMatchStats(matchId: string): Promise<MatchStats | null> {
    return resolveCached(this.matchStatsCache, matchId, async () => {
      try {
        return await this.haloInfiniteClient.getMatchStats(matchId);
      } catch {
        return null;
      }
    });
  }

  private async getMedalLookup(): Promise<MedalLookup> {
    this.medalLookupCache ??= this.haloInfiniteClient
      .getMedalsMetadataFile()
      .then((metadata) => createMedalLookup(metadata));
    return this.medalLookupCache;
  }

  private async getMapDetails(
    assetId: string | null,
    versionId: string | null,
  ): Promise<{ name: string; thumbnailUrl: string }> {
    if (assetId == null || versionId == null) {
      return { name: "Unknown Map", thumbnailUrl: "data:," };
    }

    const cacheKey = `${assetId}:${versionId}`;
    const asset = await resolveCached(this.mapAssetCache, cacheKey, async () => {
      try {
        return await this.haloInfiniteClient.getSpecificAssetVersion(AssetKind.Map, assetId, versionId);
      } catch {
        return null;
      }
    });

    if (asset == null) {
      return { name: "Unknown Map", thumbnailUrl: "data:," };
    }

    return {
      name: sanitizeMapName(asset.PublicName),
      thumbnailUrl: getMapThumbnailUrl(asset),
    };
  }

  private async getModeName(assetId: string | null, versionId: string | null): Promise<string> {
    if (assetId == null || versionId == null) {
      return "Unknown Mode";
    }

    const cacheKey = `${assetId}:${versionId}`;
    const asset = await resolveCached(this.modeAssetCache, cacheKey, async () => {
      try {
        return await this.haloInfiniteClient.getSpecificAssetVersion(AssetKind.UgcGameVariant, assetId, versionId);
      } catch {
        return null;
      }
    });

    if (asset == null) {
      return "Unknown Mode";
    }

    return normalizeModeName(asset.PublicName);
  }

  private async getGamertagsByXuid(matchDetailsById: ReadonlyMap<string, MatchStats>): Promise<Map<string, string>> {
    const xuidsToLookup = new Set<string>();
    const xuidToGamertag = new Map<string, string>();

    for (const matchStats of matchDetailsById.values()) {
      for (const player of matchStats.Players) {
        if (player.PlayerType !== 1) {
          continue;
        }

        const xuid = getPlayerXuid(player);
        const cachedGamertag = this.gamertagCache.get(xuid);
        if (cachedGamertag != null) {
          xuidToGamertag.set(xuid, cachedGamertag);
        } else {
          xuidsToLookup.add(xuid);
        }
      }
    }

    if (xuidsToLookup.size === 0) {
      return xuidToGamertag;
    }

    const BATCH_SIZE = 24;
    const xuidsArray = Array.from(xuidsToLookup);

    for (let i = 0; i < xuidsArray.length; i += BATCH_SIZE) {
      const batch = xuidsArray.slice(i, i + BATCH_SIZE);
      let users: UserInfo[] = [];
      try {
        users = await this.haloInfiniteClient.getUsers(batch);
      } catch {
        continue;
      }

      for (const user of users) {
        this.gamertagCache.set(user.xuid, user.gamertag);
        xuidToGamertag.set(user.xuid, user.gamertag);
      }
    }

    return xuidToGamertag;
  }

  public connectToTracker(userId: string, trackerId: string): IndividualTrackerConnection {
    const wsHost = this.apiHost.replace(/^https?:\/\//, (match) => (match.startsWith("https") ? "wss://" : "ws://"));
    const ws = new WebSocket(
      `${wsHost}/ws/individual-tracker/${encodeURIComponent(userId)}/${encodeURIComponent(trackerId)}`,
    );

    const connection = new RealIndividualTrackerConnection(ws);
    connection.attachWebSocket(ws);
    return connection;
  }

  public connectToActiveTracker(xuid: string): IndividualTrackerConnection {
    const wsHost = this.apiHost.replace(/^https?:\/\//, (match) => (match.startsWith("https") ? "wss://" : "ws://"));
    const ws = new WebSocket(`${wsHost}/ws/individual-tracker/${encodeURIComponent(xuid)}/active`);

    const connection = new RealIndividualTrackerConnection(ws);
    connection.attachWebSocket(ws);
    return connection;
  }

  public async getActiveTrackerView(xuid: string): Promise<ActiveTrackerViewResponse> {
    const response = await fetch(`${this.apiHost}/api/individual-tracker/${encodeURIComponent(xuid)}/active`);
    const payload = await response.json<
      | ActiveTrackerViewResponse
      | {
          status?: string;
          activeTracker?: TrackerStatusResponse["activeTracker"];
          streamerView?: ActiveTrackerViewResponse["streamerView"];
        }
    >();

    const activeTracker = payload.activeTracker ?? null;
    const streamerView = payload.streamerView ?? null;
    const { status } = payload;

    if (status === "active" || status === "offline" || status === "not-found") {
      return {
        status,
        activeTracker,
        streamerView,
      };
    }

    return {
      status: activeTracker == null ? "offline" : "active",
      activeTracker,
      streamerView,
    };
  }

  public async getActiveTrackerState(xuid: string): Promise<TrackerStatusResponse> {
    const response = await this.getActiveTrackerView(xuid);
    return { activeTracker: response.activeTracker };
  }

  public async getTrackerState(userId: string, trackerId: string): Promise<TrackerStatusResponse> {
    const response = await fetch(
      `${this.apiHost}/api/individual-tracker/manage/${encodeURIComponent(userId)}/${encodeURIComponent(trackerId)}/status`,
    );

    return response.json<TrackerStatusResponse>();
  }
}
