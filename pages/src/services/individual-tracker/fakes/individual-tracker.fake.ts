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
  IndividualTrackerService,
  TrackerMatchHistoryResponse,
  TrackerSearchResult,
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

export interface FakeTrackerSearchResultOverrides {
  readonly gamertag?: string;
  readonly xuid?: string;
}

export function aFakeTrackerSearchResultWith(overrides: FakeTrackerSearchResultOverrides = {}): TrackerSearchResult {
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
  };
}

interface FakeIndividualTrackerServiceOptions {
  readonly profile: TrackerProfile;
  readonly trackers: readonly Tracker[];
  readonly searchResult: TrackerSearchResult | null;
  readonly matchHistory: TrackerMatchHistoryResponse;
}

export interface FakeIndividualTrackerServiceFactoryOpts {
  readonly profile?: TrackerProfile;
  readonly trackers?: readonly Tracker[];
  readonly searchResult?: TrackerSearchResult | null;
  readonly matchHistory?: TrackerMatchHistoryResponse;
}

export class FakeIndividualTrackerService implements IndividualTrackerService {
  private profile: TrackerProfile;
  private trackers: Tracker[];
  private readonly searchResult: TrackerSearchResult | null;
  private readonly matchHistory: TrackerMatchHistoryResponse;

  public constructor(options?: Partial<FakeIndividualTrackerServiceOptions>) {
    this.profile = options?.profile ?? aFakeTrackerProfileWith();
    this.trackers = [...(options?.trackers ?? [aFakeTrackerWith()])];
    this.searchResult = options?.searchResult !== undefined ? options.searchResult : aFakeTrackerSearchResultWith();
    this.matchHistory = options?.matchHistory ?? { matches: [], suggestedGroupings: [] };
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
    const tracker = aFakeTrackerWith({ gamertag: req.gamertag });
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
    void query;
    await Promise.resolve();
    return this.searchResult;
  }

  public async getMatchHistory(xuid: string, start: number, count: number): Promise<TrackerMatchHistoryResponse> {
    void xuid;
    void start;
    void count;
    await Promise.resolve();
    return this.matchHistory;
  }

  public async syncMatchesToTracker(request: TrackerSyncMatchesRequest): Promise<void> {
    void request;
    await Promise.resolve();
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
  });
}
