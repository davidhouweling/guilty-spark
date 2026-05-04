import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import type { MatchStats } from "halo-infinite-api";
import type {
  IndividualTrackerConnection,
  IndividualTrackerConnectionStatus,
  IndividualTrackerCreateProfileRequest,
  IndividualTrackerCreateProfileResponse,
  IndividualTrackerGamesResponse,
  IndividualTrackerMutateGamesRequest,
  IndividualTrackerProfile,
  IndividualTrackerProfileResponse,
  IndividualTrackerReorderGamesRequest,
  IndividualTrackerStreamerViewSettings,
  IndividualTrackerService,
  IndividualTrackerStateListener,
  IndividualTrackerStatusListener,
  IndividualTrackerSubscription,
  IndividualTrackerUpdateProfileRequest,
  IndividualTrackerUpdateProfileResponse,
  IndividualTrackerUpdateStreamerViewSettingsRequest,
  PauseTrackerResponse,
  RefreshTrackerResponse,
  ResumeTrackerResponse,
  StartTrackerRequest,
  StartTrackerResponse,
  StopTrackerResponse,
  TrackerMatchHistoryResponse,
  TrackerSeriesGroupUpdateRequest,
  TrackerListResponse,
  TrackerSearchResult,
  TrackerStatusResponse,
} from "../types";

interface FakeIndividualTrackerServiceOptions {
  readonly profileResponse: IndividualTrackerProfileResponse;
  readonly streamerViewSettings: IndividualTrackerStreamerViewSettings;
  readonly activeState?: IndividualTrackerState | null;
  readonly trackerStates?: Record<string, IndividualTrackerState | null>;
  readonly trackerReferences?: Record<string, { gamertag: string; updatedAt?: number }>;
  readonly startResponse?: StartTrackerResponse;
  readonly stopResponse?: StopTrackerResponse;
  readonly shouldThrowOnStart?: boolean;
}

export interface FakeIndividualTrackerServiceFactoryOpts {
  readonly profile?: IndividualTrackerProfile | null;
  readonly games?: IndividualTrackerGamesResponse["games"];
  readonly activeState?: IndividualTrackerState | null;
  readonly trackerStates?: Record<string, IndividualTrackerState | null>;
  readonly trackerReferences?: Record<string, { gamertag: string; updatedAt?: number }>;
  readonly startResponse?: StartTrackerResponse;
  readonly stopResponse?: StopTrackerResponse;
  readonly shouldThrowOnStart?: boolean;
}

function buildDefaultProfileResponse(
  profile: IndividualTrackerProfile | null,
  games: IndividualTrackerGamesResponse["games"],
): IndividualTrackerProfileResponse {
  return {
    profile,
    games,
  };
}

export function aFakeIndividualTrackerStateWith(opts: Partial<IndividualTrackerState> = {}): IndividualTrackerState {
  const now = new Date().toISOString();
  return {
    userId: "fake-user-id",
    trackerId: "fake-tracker-id",
    xuid: "fake-xuid",
    gamertag: "FakeGamertag",
    teamColor: "salmon",
    enemyColor: "cerulean",
    status: "active",
    isPaused: false,
    startTime: now,
    lastUpdateTime: now,
    searchStartTime: now,
    lastMatchDiscoveredAt: now,
    checkCount: 0,
    idleTimeoutHours: 1,
    discoveredMatches: {},
    matchIds: [],
    matchGroupings: [],
    seriesGroups: [],
    excludedMatchIds: [],
    errorState: {
      consecutiveErrors: 0,
      backoffMinutes: 3,
      lastSuccessTime: now,
    },
    refreshInProgress: undefined,
    refreshStartedAt: undefined,
    ...opts,
  };
}

class FakeIndividualTrackerConnection implements IndividualTrackerConnection {
  private readonly stateListeners = new Set<IndividualTrackerStateListener>();
  private readonly statusListeners = new Set<IndividualTrackerStatusListener>();

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
    this.stateListeners.clear();
    this.statusListeners.clear();
  }

  public emitStatus(status: IndividualTrackerConnectionStatus, detail?: string): void {
    for (const listener of this.statusListeners) {
      listener(status, detail);
    }
  }

  public emitState(state: IndividualTrackerState): void {
    for (const listener of this.stateListeners) {
      listener(state);
    }
  }
}

export class FakeIndividualTrackerService implements IndividualTrackerService {
  private readonly options: FakeIndividualTrackerServiceOptions;
  private streamerViewSettings: IndividualTrackerStreamerViewSettings;

  public constructor(options?: Partial<FakeIndividualTrackerServiceOptions>) {
    this.options = {
      profileResponse: options?.profileResponse ?? {
        profile: null,
        games: [],
      },
      streamerViewSettings: {
        profileId: "profile-1",
        layoutOptions: {},
        visibleSections: {},
        styleFlags: {},
        updatedAt: null,
      },
      ...options,
    };
    this.streamerViewSettings = this.options.streamerViewSettings;
  }

  public async getStreamerViewSettings(profileId: string): Promise<IndividualTrackerStreamerViewSettings> {
    return Promise.resolve({
      ...this.streamerViewSettings,
      profileId,
    });
  }

  public async updateStreamerViewSettings(
    request: IndividualTrackerUpdateStreamerViewSettingsRequest,
  ): Promise<IndividualTrackerStreamerViewSettings> {
    this.streamerViewSettings = {
      profileId: request.profileId,
      layoutOptions: request.layoutOptions ?? this.streamerViewSettings.layoutOptions,
      visibleSections: request.visibleSections ?? this.streamerViewSettings.visibleSections,
      styleFlags: {
        ...this.streamerViewSettings.styleFlags,
        ...(request.styleFlags ?? {}),
      },
      updatedAt: Math.floor(Date.now() / 1000),
    };

    return Promise.resolve(this.streamerViewSettings);
  }

  public async getProfile(): Promise<IndividualTrackerProfileResponse> {
    await Promise.resolve();
    return this.options.profileResponse;
  }

  public async createProfile(
    request: IndividualTrackerCreateProfileRequest,
  ): Promise<IndividualTrackerCreateProfileResponse> {
    void request;
    await Promise.resolve();

    if (this.options.profileResponse.profile === null) {
      throw new Error("No profile configured in fake service");
    }

    return { profile: this.options.profileResponse.profile };
  }

  public async updateProfile(
    request: IndividualTrackerUpdateProfileRequest,
  ): Promise<IndividualTrackerUpdateProfileResponse> {
    void request;
    await Promise.resolve();

    if (this.options.profileResponse.profile === null) {
      throw new Error("No profile configured in fake service");
    }

    return { profile: this.options.profileResponse.profile };
  }

  public async addGame(request: IndividualTrackerMutateGamesRequest): Promise<IndividualTrackerGamesResponse> {
    void request;
    await Promise.resolve();
    return { games: this.options.profileResponse.games };
  }

  public async removeGame(request: IndividualTrackerMutateGamesRequest): Promise<IndividualTrackerGamesResponse> {
    void request;
    await Promise.resolve();
    return { games: this.options.profileResponse.games };
  }

  public async reorderGames(request: IndividualTrackerReorderGamesRequest): Promise<IndividualTrackerGamesResponse> {
    void request;
    await Promise.resolve();
    return { games: this.options.profileResponse.games };
  }

  public async startTracker(opts: StartTrackerRequest): Promise<StartTrackerResponse> {
    void opts;
    if (this.options.shouldThrowOnStart === true) {
      throw new Error("Fake start error");
    }

    if (this.options.startResponse != null) {
      return Promise.resolve(this.options.startResponse);
    }

    const state = aFakeIndividualTrackerStateWith();
    return Promise.resolve({ success: true, state });
  }

  public async stopTracker(trackerId: string): Promise<StopTrackerResponse> {
    void trackerId;
    if (this.options.stopResponse != null) {
      return Promise.resolve(this.options.stopResponse);
    }

    const state = aFakeIndividualTrackerStateWith({ status: "stopped" });
    return Promise.resolve({ success: true, state });
  }

  public async pauseTracker(trackerId: string): Promise<PauseTrackerResponse> {
    void trackerId;
    const state = aFakeIndividualTrackerStateWith({ status: "paused" });
    return Promise.resolve({ success: true, state });
  }

  public async resumeTracker(trackerId: string): Promise<ResumeTrackerResponse> {
    void trackerId;
    const state = aFakeIndividualTrackerStateWith({ status: "active" });
    return Promise.resolve({ success: true, state });
  }

  public async refreshTracker(trackerId: string): Promise<RefreshTrackerResponse> {
    void trackerId;
    const state = aFakeIndividualTrackerStateWith({ lastUpdateTime: new Date().toISOString() });
    return Promise.resolve({ success: true, state });
  }

  public async selectLiveTracker(trackerId: string): Promise<void> {
    void trackerId;
    return Promise.resolve();
  }

  public async deleteTracker(trackerId: string): Promise<void> {
    void trackerId;
    return Promise.resolve();
  }

  public async searchGamertag(query: string): Promise<TrackerSearchResult | null> {
    const normalized = query.trim();
    if (normalized === "") {
      return Promise.resolve(null);
    }

    return Promise.resolve({
      gamertag: normalized,
      xuid: "fake-xuid",
      rankLabel: null,
      csrLabel: null,
      currentRankTier: null,
      currentRankSubTier: null,
      currentRankMeasurementMatchesRemaining: null,
      currentRankInitialMeasurementMatches: null,
      allTimePeakRankLabel: null,
      allTimePeakCsrLabel: null,
      allTimePeakRankTier: null,
      allTimePeakRankSubTier: null,
      seasonPeakCsrLabel: null,
      seasonPeakRankTier: null,
      seasonPeakRankSubTier: null,
      matchmadeMatchCount: null,
      customMatchCount: null,
    });
  }

  public async getMatchHistory(xuid: string, start: number, count: number): Promise<TrackerMatchHistoryResponse> {
    void xuid;
    void start;
    void count;

    return Promise.resolve({
      matches: [],
      suggestedGroupings: [],
    });
  }

  public async getMedalMetadata(matches: readonly MatchStats[]): Promise<MedalMetadata> {
    void matches;
    return Promise.resolve({});
  }

  public async syncMatchesToTracker(): Promise<void> {
    return Promise.resolve();
  }

  public async updateSeriesGroup(request: TrackerSeriesGroupUpdateRequest): Promise<IndividualTrackerState> {
    const currentState =
      this.options.trackerStates?.[request.trackerId] ?? this.options.activeState ?? aFakeIndividualTrackerStateWith();
    const requestKey = [...request.matchIds].sort((left, right) => left.localeCompare(right)).join(":");
    const nextSeriesGroups = currentState.seriesGroups.filter((group) => {
      const groupKey = [...group.matchIds].sort((left, right) => left.localeCompare(right)).join(":");
      return groupKey !== requestKey;
    });

    if (request.titleOverride != null || request.subtitleOverride != null) {
      nextSeriesGroups.push({
        matchIds: [...request.matchIds],
        titleOverride: request.titleOverride,
        subtitleOverride: request.subtitleOverride,
      });
    }

    const nextState: IndividualTrackerState = {
      ...currentState,
      seriesGroups: nextSeriesGroups,
    };

    if (this.options.trackerStates != null) {
      this.options.trackerStates[request.trackerId] = nextState;
    }

    return Promise.resolve(nextState);
  }

  public async addMatchToTracker(trackerId: string, matchId: string): Promise<void> {
    void trackerId;
    void matchId;
    return Promise.resolve();
  }

  public async removeMatchFromTracker(trackerId: string, matchId: string): Promise<void> {
    void trackerId;
    void matchId;
    return Promise.resolve();
  }

  public async getTrackers(userId: string): Promise<TrackerListResponse> {
    void userId;

    const references = this.options.trackerReferences;
    if (references == null) {
      return Promise.resolve({ trackers: [], statuses: {} });
    }

    const trackers = Object.entries(references).map(([trackerId, data]) => ({
      trackerId,
      gamertag: data.gamertag,
      updatedAt: data.updatedAt ?? Math.floor(Date.now() / 1000),
    }));

    const statuses: Record<string, IndividualTrackerState | null> = {};
    for (const { trackerId } of trackers) {
      statuses[trackerId] = this.options.trackerStates?.[trackerId] ?? null;
    }

    return Promise.resolve({ trackers, statuses });
  }

  public connectToTracker(userId: string, trackerId: string): IndividualTrackerConnection {
    void userId;
    void trackerId;
    return new FakeIndividualTrackerConnection();
  }

  public connectToActiveTracker(userId: string): IndividualTrackerConnection {
    void userId;
    return new FakeIndividualTrackerConnection();
  }

  public async getActiveTrackerState(userId: string): Promise<TrackerStatusResponse> {
    void userId;
    return Promise.resolve({ activeTracker: this.options.activeState ?? null });
  }

  public async getTrackerState(userId: string, trackerId: string): Promise<TrackerStatusResponse> {
    void userId;
    const state = this.options.trackerStates?.[trackerId] ?? null;
    return Promise.resolve({ activeTracker: state });
  }
}

export function aFakeIndividualTrackerServiceWith(
  opts: FakeIndividualTrackerServiceFactoryOpts = {},
): FakeIndividualTrackerService {
  return new FakeIndividualTrackerService({
    profileResponse: buildDefaultProfileResponse(opts.profile ?? null, opts.games ?? []),
    activeState: opts.activeState,
    trackerStates: opts.trackerStates,
    trackerReferences: opts.trackerReferences,
    startResponse: opts.startResponse,
    stopResponse: opts.stopResponse,
    shouldThrowOnStart: opts.shouldThrowOnStart,
  });
}
