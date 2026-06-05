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
import type { IndividualTrackerService } from "../types";

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

interface FakeIndividualTrackerServiceOptions {
  readonly profile: TrackerProfile;
  readonly trackers: readonly Tracker[];
}

export interface FakeIndividualTrackerServiceFactoryOpts {
  readonly profile?: TrackerProfile;
  readonly trackers?: readonly Tracker[];
}

export class FakeIndividualTrackerService implements IndividualTrackerService {
  private profile: TrackerProfile;
  private trackers: Tracker[];

  public constructor(options?: Partial<FakeIndividualTrackerServiceOptions>) {
    this.profile = options?.profile ?? aFakeTrackerProfileWith();
    this.trackers = [...(options?.trackers ?? [aFakeTrackerWith()])];
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

  public async selectMatches(): Promise<void> {
    await Promise.resolve();
  }

  public async clearMatchSelection(): Promise<void> {
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
  });
}
