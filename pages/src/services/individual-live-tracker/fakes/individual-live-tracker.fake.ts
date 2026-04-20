import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import type {
  IndividualTrackerConnection,
  IndividualTrackerConnectionStatus,
  IndividualLiveTrackerService,
  IndividualTrackerStateListener,
  IndividualTrackerStatusListener,
  IndividualTrackerSubscription,
  StartTrackerRequest,
  StartTrackerResponse,
  StopTrackerResponse,
  PauseTrackerResponse,
  ResumeTrackerResponse,
  TrackerListResponse,
  TrackerStatusResponse,
  TrackerRecentMatch,
  TrackerSearchResult,
} from "../types";

export interface FakeIndividualLiveTrackerServiceOpts {
  activeState?: IndividualTrackerState | null;
  trackerStates?: Record<string, IndividualTrackerState | null>;
  trackerReferences?: Record<string, { gamertag: string; updatedAt?: number }>;
  startResponse?: StartTrackerResponse;
  stopResponse?: StopTrackerResponse;
  shouldThrowOnStart?: boolean;
}

export function aFakeIndividualTrackerStateWith(opts: Partial<IndividualTrackerState> = {}): IndividualTrackerState {
  const now = new Date().toISOString();
  return {
    userId: "fake-user-id",
    trackerId: "fake-tracker-id",
    xuid: "fake-xuid",
    gamertag: "FakeGamertag",
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

export class FakeIndividualLiveTrackerService implements IndividualLiveTrackerService {
  private readonly opts: FakeIndividualLiveTrackerServiceOpts;

  public constructor(opts: FakeIndividualLiveTrackerServiceOpts = {}) {
    this.opts = opts;
  }

  public async startTracker(opts: StartTrackerRequest): Promise<StartTrackerResponse> {
    void opts;
    if (this.opts.shouldThrowOnStart === true) {
      throw new Error("Fake start error");
    }

    if (this.opts.startResponse != null) {
      return Promise.resolve(this.opts.startResponse);
    }

    const state = aFakeIndividualTrackerStateWith();
    return Promise.resolve({ success: true, state });
  }

  public async stopTracker(trackerId: string): Promise<StopTrackerResponse> {
    void trackerId;
    if (this.opts.stopResponse != null) {
      return Promise.resolve(this.opts.stopResponse);
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
    });
  }

  public async getRecentMatches(xuid: string, start: number, count: number): Promise<readonly TrackerRecentMatch[]> {
    void xuid;
    void start;
    void count;
    return Promise.resolve([]);
  }

  public async addMatchToTracker(trackerId: string, matchId: string): Promise<void> {
    void trackerId;
    void matchId;
    return Promise.resolve();
  }

  public async getTrackers(userId: string): Promise<TrackerListResponse> {
    void userId;

    const references = this.opts.trackerReferences;
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
      statuses[trackerId] = this.opts.trackerStates?.[trackerId] ?? null;
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
    return Promise.resolve({ activeTracker: this.opts.activeState ?? null });
  }
}
