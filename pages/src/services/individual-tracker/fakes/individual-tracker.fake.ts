import type {
  TrackerProfile,
  TrackerProfileResponse,
  UpdateTrackerProfileRequest,
} from "@guilty-spark/shared/contracts/individual-tracker/profile";
import type {
  StartTrackerRequest,
  Tracker,
  TrackerResponse,
  TrackersResponse,
} from "@guilty-spark/shared/contracts/individual-tracker/tracker";
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
} from "../types";

interface FakeTrackerOverrides {
  readonly trackerId?: string;
  readonly gamertag?: string;
  readonly xuid?: string;
  readonly status?: Tracker["status"];
  readonly isLive?: boolean;
  readonly state?: Tracker["state"];
}

export function aFakeTrackerWith(overrides: FakeTrackerOverrides = {}): Tracker {
  const trackerId = overrides.trackerId ?? "fake-tracker-id";
  const gamertag = overrides.gamertag ?? "Fake Spartan";
  const xuid = overrides.xuid ?? "2533274800000001";
  const status = overrides.status ?? "active";
  return {
    trackerId,
    gamertag,
    xuid,
    status,
    isLive: overrides.isLive ?? true,
    state: overrides.state ?? {
      userId: "fake-user-id",
      trackerId,
      xuid,
      gamertag,
      status,
      isPaused: status === "paused",
      startTime: "2100-01-01T00:00:00.000Z",
      lastUpdateTime: "2100-01-01T00:00:00.000Z",
      idleTimeoutHours: 6,
      hasActiveSeries: false,
    },
  };
}

interface FakeProfileOverrides {
  readonly profileId?: string;
  readonly activeIdentityId?: string | null;
  readonly name?: string;
}

export function aFakeTrackerProfileWith(overrides: FakeProfileOverrides = {}): TrackerProfile {
  return {
    profileId: overrides.profileId ?? "fake-profile-id",
    activeIdentityId: overrides.activeIdentityId ?? null,
    name: overrides.name ?? "Fake Profile",
  };
}

export function aFakeTrackerSearchResultWith(overrides: Partial<TrackerSearchResult> = {}): TrackerSearchResult {
  return {
    gamertag: overrides.gamertag ?? "Fake Spartan",
    xuid: overrides.xuid ?? "2533274800000001",
    rankLabel: "Gold 5",
    csrLabel: "1200",
    currentRankTier: "Gold",
    currentRankSubTier: 5,
    currentRankMeasurementMatchesRemaining: null,
    currentRankInitialMeasurementMatches: null,
    allTimePeakRankLabel: "Platinum 1",
    allTimePeakCsrLabel: "1300",
    allTimePeakRankTier: "Platinum",
    allTimePeakRankSubTier: 1,
    seasonPeakCsrLabel: "1250",
    seasonPeakRankTier: "Gold",
    seasonPeakRankSubTier: 6,
    matchmadeMatchCount: 20,
    customMatchCount: 8,
    ...overrides,
  };
}

export function aFakeMatchHistoryEntryWith(
  overrides: Partial<TrackerMatchHistoryEntry> = {},
): TrackerMatchHistoryEntry {
  return {
    matchId: "fake-match-id",
    startTime: "Jan 1, 2026, 12:00:00 AM",
    endTime: "Jan 1, 2026, 12:10:00 AM",
    mapAssetId: "fake-map-asset-id",
    mapVersionId: "fake-map-version-id",
    modeAssetId: "fake-mode-asset-id",
    modeVersionId: "fake-mode-version-id",
    gameVariantCategory: 6,
    startTimeIso: "2026-01-01T00:00:00.000Z",
    endTimeIso: "2026-01-01T00:10:00.000Z",
    duration: "10m 0s",
    mapName: "Aquarius",
    modeName: "Slayer",
    outcome: "Win",
    resultString: "Win",
    isMatchmaking: false,
    category: "custom",
    teams: [],
    mapThumbnailUrl: "data:,",
    ...overrides,
  };
}

interface FakeIndividualTrackerServiceOptions {
  readonly profile: TrackerProfile;
  readonly trackers: readonly Tracker[];
  readonly searchResult: TrackerSearchResult | null;
  readonly matchHistory: TrackerMatchHistoryResponse;
  readonly searchResults: readonly TrackerSearchResult[];
  readonly matchHistoryEntries: readonly TrackerMatchHistoryEntry[];
}

export interface FakeIndividualTrackerServiceFactoryOpts {
  readonly profile?: TrackerProfile;
  readonly trackers?: readonly Tracker[];
  readonly searchResult?: TrackerSearchResult | null;
  readonly matchHistory?: TrackerMatchHistoryResponse;
  readonly searchResults?: readonly TrackerSearchResult[];
  readonly matchHistoryEntries?: readonly TrackerMatchHistoryEntry[];
}

export class FakeIndividualTrackerService implements IndividualTrackerService {
  private profile: TrackerProfile;
  private trackers: Tracker[];
  private readonly searchResult: TrackerSearchResult | null;
  private readonly matchHistory: TrackerMatchHistoryResponse;
  private readonly searchResults: readonly TrackerSearchResult[] | null;
  private readonly matchHistoryEntries: readonly TrackerMatchHistoryEntry[] | null;

  public constructor(options?: Partial<FakeIndividualTrackerServiceOptions>) {
    this.profile = options?.profile ?? aFakeTrackerProfileWith();
    this.trackers = [...(options?.trackers ?? [aFakeTrackerWith()])];
    this.searchResult = options?.searchResult !== undefined ? options.searchResult : aFakeTrackerSearchResultWith();
    this.matchHistory = options?.matchHistory ?? { matches: [], suggestedGroupings: [] };
    this.searchResults = options?.searchResults ?? null;
    this.matchHistoryEntries = options?.matchHistoryEntries ?? null;
  }

  public async getProfile(): Promise<TrackerProfileResponse> {
    await Promise.resolve();
    return { profile: this.profile };
  }

  public async updateProfile(req: UpdateTrackerProfileRequest): Promise<TrackerProfileResponse> {
    await Promise.resolve();
    this.profile = {
      ...this.profile,
      ...(req.name !== undefined ? { name: req.name } : {}),
      ...(req.activeIdentityId !== undefined ? { activeIdentityId: req.activeIdentityId } : {}),
    };
    return { profile: this.profile };
  }

  public async listTrackers(): Promise<TrackersResponse> {
    await Promise.resolve();
    return { trackers: [...this.trackers] };
  }

  public async startTracker(req: StartTrackerRequest): Promise<TrackerResponse> {
    await Promise.resolve();
    const tracker = aFakeTrackerWith({ gamertag: req.gamertag, isLive: false });
    this.trackers = [...this.trackers, tracker];
    return { tracker };
  }

  public async stopTracker(trackerId: string): Promise<void> {
    await Promise.resolve();
    this.trackers = this.trackers.filter((tracker) => tracker.trackerId !== trackerId);
  }

  public async pauseTracker(trackerId: string): Promise<TrackerResponse> {
    await Promise.resolve();
    return { tracker: this.mutateTrackerStatus(trackerId, "paused") };
  }

  public async resumeTracker(trackerId: string): Promise<TrackerResponse> {
    await Promise.resolve();
    return { tracker: this.mutateTrackerStatus(trackerId, "active") };
  }

  public async selectActive(trackerId: string): Promise<TrackerResponse> {
    await Promise.resolve();
    this.trackers = this.trackers.map((tracker) => ({ ...tracker, isLive: tracker.trackerId === trackerId }));
    return { tracker: this.findTracker(trackerId) };
  }

  public async getTrackerStatus(trackerId: string): Promise<TrackerResponse> {
    await Promise.resolve();
    return { tracker: this.findTracker(trackerId) };
  }

  public async searchGamertag(query: string): Promise<TrackerSearchResult | null> {
    await Promise.resolve();
    if (this.searchResults !== null) {
      const normalized = query.trim().toLowerCase();
      const result = this.searchResults.find((r) => r.gamertag.toLowerCase() === normalized);
      return result ?? null;
    }
    return this.searchResult;
  }

  /* eslint-disable @typescript-eslint/no-unused-vars */
  public async getMatchHistory(
    _xuid: string,
    _start: number,
    _count: number,
    _category?: "custom" | "all",
  ): Promise<TrackerMatchHistoryResponse> {
    /* eslint-enable @typescript-eslint/no-unused-vars */
    await Promise.resolve();
    if (this.matchHistoryEntries !== null) {
      return { matches: [...this.matchHistoryEntries], suggestedGroupings: [] };
    }
    return this.matchHistory;
  }

  public async syncMatchesToTracker(request: TrackerSyncMatchesRequest): Promise<void> {
    void request;
    await Promise.resolve();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async startSeries(_request: StartSeriesRequest): Promise<StartSeriesResponse> {
    await Promise.resolve();
    return { success: true };
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
    await Promise.resolve();
    this.trackers = this.trackers.filter((t) => t.trackerId !== trackerId);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async endSeries(_trackerId: string): Promise<void> {
    await Promise.resolve();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async editSeries(_trackerId: string, _request: EditSeriesRequest): Promise<void> {
    await Promise.resolve();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public async resumeSeries(_trackerId: string): Promise<void> {
    await Promise.resolve();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public connectToTracker(_userId: string, _trackerId: string): IndividualTrackerConnection {
    return {
      subscribe: () => ({
        unsubscribe: (): void => {
          return;
        },
      }),
      subscribeStatus: () => ({
        unsubscribe: (): void => {
          return;
        },
      }),
      disconnect: (): void => {
        return;
      },
    };
  }

  private findTracker(trackerId: string): Tracker {
    return this.trackers.find((tracker) => tracker.trackerId === trackerId) ?? aFakeTrackerWith({ trackerId });
  }

  private mutateTrackerStatus(trackerId: string, status: Tracker["status"]): Tracker {
    const existing = this.trackers.find((tracker) => tracker.trackerId === trackerId);
    const updated = aFakeTrackerWith({
      trackerId,
      gamertag: existing?.gamertag ?? "Fake Spartan",
      xuid: existing?.xuid ?? "2533274800000001",
      isLive: existing?.isLive ?? false,
      status,
    });
    this.trackers = this.trackers.map((tracker) => (tracker.trackerId === trackerId ? updated : tracker));
    return updated;
  }
}

export function aFakeIndividualTrackerServiceWith(
  opts: FakeIndividualTrackerServiceFactoryOpts = {},
): FakeIndividualTrackerService {
  return new FakeIndividualTrackerService({
    ...(opts.profile !== undefined ? { profile: opts.profile } : {}),
    ...(opts.trackers !== undefined ? { trackers: opts.trackers } : {}),
    ...(opts.searchResult !== undefined ? { searchResult: opts.searchResult } : {}),
    ...(opts.matchHistory !== undefined ? { matchHistory: opts.matchHistory } : {}),
    ...(opts.searchResults !== undefined ? { searchResults: opts.searchResults } : {}),
    ...(opts.matchHistoryEntries !== undefined ? { matchHistoryEntries: opts.matchHistoryEntries } : {}),
  });
}
