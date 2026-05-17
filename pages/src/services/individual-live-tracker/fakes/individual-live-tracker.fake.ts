import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import type {
  IndividualTrackerConnection,
  IndividualTrackerConnectionStatus,
  IndividualLiveTrackerService,
  IndividualTrackerStateListener,
  IndividualTrackerStatusListener,
  IndividualTrackerSubscription,
  StartTrackerResponse,
  StopTrackerResponse,
  TrackerStatusResponse,
} from "../types";

export interface FakeIndividualLiveTrackerServiceOpts {
  activeState?: IndividualTrackerState | null;
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

  public async startTracker(): Promise<StartTrackerResponse> {
    if (this.opts.shouldThrowOnStart === true) {
      throw new Error("Fake start error");
    }

    if (this.opts.startResponse != null) {
      return Promise.resolve(this.opts.startResponse);
    }

    const state = aFakeIndividualTrackerStateWith();
    return Promise.resolve({ success: true, state });
  }

  public async stopTracker(): Promise<StopTrackerResponse> {
    if (this.opts.stopResponse != null) {
      return Promise.resolve(this.opts.stopResponse);
    }

    const state = aFakeIndividualTrackerStateWith({ status: "stopped" });
    return Promise.resolve({ success: true, state });
  }

  public async getStatus(): Promise<TrackerStatusResponse> {
    return Promise.resolve({ activeTracker: this.opts.activeState ?? null });
  }

  public connectToTracker(): IndividualTrackerConnection {
    return new FakeIndividualTrackerConnection();
  }

  public connectToActiveTracker(): IndividualTrackerConnection {
    return new FakeIndividualTrackerConnection();
  }

  public async getActiveTrackerState(): Promise<TrackerStatusResponse> {
    return Promise.resolve({ activeTracker: this.opts.activeState ?? null });
  }
}
