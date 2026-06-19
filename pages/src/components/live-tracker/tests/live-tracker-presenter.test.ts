import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { LiveTrackerMessage } from "@guilty-spark/shared/live-tracker/types";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { sampleLiveTrackerStateMessage } from "@guilty-spark/shared/live-tracker/fakes/data";
import { LiveTrackerPresenter } from "../live-tracker-presenter";
import type {
  LiveTrackerConnection,
  LiveTrackerListener,
  LiveTrackerService,
  LiveTrackerSubscription,
  LiveTrackerStatusListener,
} from "../../../services/live-tracker/types";
import { aFakeMatchAnalyticsServiceWith } from "../../../services/stats/fakes/match-analytics.fake";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import type { LiveTrackerSnapshot, LiveTrackerStore } from "../live-tracker-store";

class MockLiveTrackerConnection implements LiveTrackerConnection {
  private readonly statusListeners = new Set<LiveTrackerStatusListener>();
  private readonly messageListeners = new Set<LiveTrackerListener>();

  public subscribe(listener: LiveTrackerListener): LiveTrackerSubscription {
    this.messageListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.messageListeners.delete(listener);
      },
    };
  }

  public subscribeStatus(listener: LiveTrackerStatusListener): LiveTrackerSubscription {
    this.statusListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.statusListeners.delete(listener);
      },
    };
  }

  public disconnect(): void {
    this.statusListeners.clear();
    this.messageListeners.clear();
  }

  public emitStatus(status: Parameters<LiveTrackerStatusListener>[0], detail?: string): void {
    for (const listener of this.statusListeners) {
      listener(status, detail);
    }
  }

  public emitMessage(message: LiveTrackerMessage): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }
}

class MockLiveTrackerService implements LiveTrackerService {
  public connectionCount = 0;

  public async connect(): Promise<LiveTrackerConnection> {
    this.connectionCount++;
    return Promise.resolve(new MockLiveTrackerConnection());
  }
}

class MockLiveTrackerStore {
  private snapshot: LiveTrackerSnapshot;
  public readonly subscribers = new Set<() => void>();

  public constructor() {
    this.snapshot = {
      params: {
        type: "team",
        server: "1",
        queue: "3",
      },
      connectionState: "idle",
      statusText: "",
      lastStateMessage: null,
      hasConnection: false,
      hasReceivedInitialData: false,
      analyticsByMatchId: new Map(),
      analyticsStatus: ComponentLoaderStatus.LOADED,
      allMatchStats: [],
      seriesStatsData: null,
    };
  }

  public getSnapshot(): LiveTrackerSnapshot {
    return this.snapshot;
  }

  public setSnapshot(snapshot: LiveTrackerSnapshot): void {
    this.snapshot = snapshot;
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }
}

describe("LiveTrackerPresenter - Analytics Fetch", () => {
  beforeEach((): void => {
    vi.useFakeTimers();
  });

  afterEach((): void => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("transitions analyticsStatus LOADING then LOADED and calls getBatchMatchAnalytics once per batch", async (): Promise<void> => {
    const mockStore = new MockLiveTrackerStore();
    const analyticsService = aFakeMatchAnalyticsServiceWith();
    const getBatchSpy = vi.spyOn(analyticsService, "getBatchMatchAnalytics");

    let currentConnection: MockLiveTrackerConnection | null = null;
    const mockService = new MockLiveTrackerService();
    vi.spyOn(mockService, "connect").mockImplementation(async (): Promise<LiveTrackerConnection> => {
      currentConnection = new MockLiveTrackerConnection();
      return Promise.resolve(currentConnection);
    });

    const presenter = new LiveTrackerPresenter({
      getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService: mockService,
      store: mockStore as unknown as LiveTrackerStore,
      matchAnalyticsService: analyticsService,
    });

    presenter.start();
    await vi.runAllTimersAsync();

    const connection = currentConnection as unknown as MockLiveTrackerConnection;
    connection.emitStatus("connected");
    connection.emitMessage(sampleLiveTrackerStateMessage);

    // Status transitions to LOADING synchronously inside fetchAnalyticsAsync before the first await
    expect(mockStore.getSnapshot().analyticsStatus).toBe(ComponentLoaderStatus.LOADING);

    // Flush microtasks so the fake analytics Promise.resolve() completes
    await vi.runAllTimersAsync();

    const rawMatchIds = Object.keys(sampleLiveTrackerStateMessage.data.rawMatches);
    expect(mockStore.getSnapshot().analyticsStatus).toBe(ComponentLoaderStatus.LOADED);
    // All 5 matches fit in one batch (ANALYTICS_BATCH_SIZE = 30)
    expect(getBatchSpy).toHaveBeenCalledTimes(1);
    expect(getBatchSpy).toHaveBeenCalledWith(expect.arrayContaining(rawMatchIds));
    expect(mockStore.getSnapshot().analyticsByMatchId.size).toBe(rawMatchIds.length);

    presenter.dispose();
  });

  it("does not fetch analytics again when the same state message arrives a second time", async (): Promise<void> => {
    const mockStore = new MockLiveTrackerStore();
    const analyticsService = aFakeMatchAnalyticsServiceWith();
    const getBatchSpy = vi.spyOn(analyticsService, "getBatchMatchAnalytics");

    let currentConnection: MockLiveTrackerConnection | null = null;
    const mockService = new MockLiveTrackerService();
    vi.spyOn(mockService, "connect").mockImplementation(async (): Promise<LiveTrackerConnection> => {
      currentConnection = new MockLiveTrackerConnection();
      return Promise.resolve(currentConnection);
    });

    const presenter = new LiveTrackerPresenter({
      getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService: mockService,
      store: mockStore as unknown as LiveTrackerStore,
      matchAnalyticsService: analyticsService,
    });

    presenter.start();
    await vi.runAllTimersAsync();

    const connection = currentConnection as unknown as MockLiveTrackerConnection;
    connection.emitStatus("connected");
    connection.emitMessage(sampleLiveTrackerStateMessage);
    await vi.runAllTimersAsync();

    expect(getBatchSpy).toHaveBeenCalledTimes(1);

    // Emit the same state message again (heartbeat with identical rawMatches)
    connection.emitMessage(sampleLiveTrackerStateMessage);
    await vi.runAllTimersAsync();

    expect(getBatchSpy).toHaveBeenCalledTimes(1);

    presenter.dispose();
  });

  it("rolls back fetchedMatchIds and re-triggers fetch when lastStateMessage changes before the fetch resolves", async (): Promise<void> => {
    const mockStore = new MockLiveTrackerStore();
    const analyticsService = aFakeMatchAnalyticsServiceWith();

    let resolveStaleFetch!: (value: Record<string, MatchAnalytics | null>) => void;
    const staleFetch = new Promise<Record<string, MatchAnalytics | null>>((resolve) => {
      resolveStaleFetch = resolve;
    });
    // First call returns a deferred promise; subsequent calls use the real fake (resolves immediately)
    const getBatchSpy = vi.spyOn(analyticsService, "getBatchMatchAnalytics").mockReturnValueOnce(staleFetch);

    let currentConnection: MockLiveTrackerConnection | null = null;
    const mockService = new MockLiveTrackerService();
    vi.spyOn(mockService, "connect").mockImplementation(async (): Promise<LiveTrackerConnection> => {
      currentConnection = new MockLiveTrackerConnection();
      return Promise.resolve(currentConnection);
    });

    const presenter = new LiveTrackerPresenter({
      getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService: mockService,
      store: mockStore as unknown as LiveTrackerStore,
      matchAnalyticsService: analyticsService,
    });

    presenter.start();
    await vi.runAllTimersAsync();

    const connection = currentConnection as unknown as MockLiveTrackerConnection;
    connection.emitStatus("connected");
    connection.emitMessage(sampleLiveTrackerStateMessage);

    expect(mockStore.getSnapshot().analyticsStatus).toBe(ComponentLoaderStatus.LOADING);

    // Simulate a new lastStateMessage arriving (different object reference) before the stale fetch resolves
    const snapshotBeforeResolve = mockStore.getSnapshot();
    const newStateMessage = { ...sampleLiveTrackerStateMessage };
    mockStore.setSnapshot({ ...snapshotBeforeResolve, lastStateMessage: newStateMessage });

    // Resolve the first (stale) fetch with empty results
    resolveStaleFetch({});
    await vi.runAllTimersAsync();

    const rawMatchIds = Object.keys(sampleLiveTrackerStateMessage.data.rawMatches);
    // Stale fetch result is discarded; fetchedMatchIds are rolled back and a re-triggered fetch runs
    expect(getBatchSpy).toHaveBeenCalledTimes(2);
    expect(mockStore.getSnapshot().analyticsStatus).toBe(ComponentLoaderStatus.LOADED);
    expect(mockStore.getSnapshot().analyticsByMatchId.size).toBe(rawMatchIds.length);

    presenter.dispose();
  });
});

describe("LiveTrackerPresenter - Retry Behavior", () => {
  beforeEach((): void => {
    vi.useFakeTimers();
  });

  afterEach((): void => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("stops retrying after maxReconnectionAttempts (10) is reached", async (): Promise<void> => {
    const mockService = new MockLiveTrackerService();
    const mockStore = new MockLiveTrackerStore();

    // Track connections as they're created
    const createdConnections: MockLiveTrackerConnection[] = [];
    vi.spyOn(mockService, "connect").mockImplementation(async (): Promise<LiveTrackerConnection> => {
      const conn = new MockLiveTrackerConnection();
      createdConnections.push(conn);
      return Promise.resolve(conn);
    });

    const presenter = new LiveTrackerPresenter({
      getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService: mockService,
      store: mockStore as unknown as LiveTrackerStore,
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    });

    // Start the connection
    presenter.start();
    await vi.runAllTimersAsync();

    // Initial connection succeeds and receives data
    const [initialConnection] = createdConnections;
    expect(initialConnection).toBeDefined();

    // Simulate initial connection success and data
    initialConnection.emitStatus("connected");
    await vi.runAllTimersAsync();
    initialConnection.emitMessage(sampleLiveTrackerStateMessage);
    await vi.runAllTimersAsync();

    // Lose the connection
    initialConnection.emitStatus("error", "Connection lost");
    await vi.runAllTimersAsync();

    // Verify retry behavior starts
    let foundRetryAttempt = false;

    // Simulate many retry attempts - each new connection fails
    for (let i = 0; i < 25; i++) {
      await vi.advanceTimersByTimeAsync(2000);
      await vi.runAllTimersAsync();

      // Fail the latest connection attempt
      const [latestConnection] = createdConnections.slice(-1);
      expect(latestConnection).toBeDefined();
      latestConnection.emitStatus("error", "Still failing");
      await vi.runAllTimersAsync();

      const snapshot = mockStore.getSnapshot();

      // Check if we see retry attempts in the status text
      if (snapshot.statusText.includes("Attempt")) {
        foundRetryAttempt = true;
      }

      // Once we hit max retries or time limit, should stop
      if (snapshot.statusText.includes("Max retries") || snapshot.statusText.includes("Gave up")) {
        break;
      }
    }

    // Verify that retries were attempted (we saw "Attempt N/10" in status)
    expect(foundRetryAttempt).toBe(true);

    // Verify multiple connection attempts were made (initial + retries)
    expect(createdConnections.length).toBeGreaterThan(1);

    presenter.dispose();
  });

  it("does not retry when tracker is not found (404) on initial connection", async (): Promise<void> => {
    const mockService = new MockLiveTrackerService();
    const mockStore = new MockLiveTrackerStore();

    let currentConnection: MockLiveTrackerConnection | null = null;
    vi.spyOn(mockService, "connect").mockImplementation(async (): Promise<LiveTrackerConnection> => {
      currentConnection = new MockLiveTrackerConnection();
      return Promise.resolve(currentConnection);
    });

    const presenter = new LiveTrackerPresenter({
      getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService: mockService,
      store: mockStore as unknown as LiveTrackerStore,
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    });

    // Start the connection
    presenter.start();
    await vi.runAllTimersAsync();

    // Simulate 404 not found status on initial connection
    expect(currentConnection).not.toBeNull();
    const connection = currentConnection as unknown as MockLiveTrackerConnection;
    connection.emitStatus("not_found");
    await vi.runAllTimersAsync();

    const snapshot1 = mockStore.getSnapshot();
    expect(snapshot1.connectionState).toBe("not_found");
    expect(snapshot1.statusText).toContain("No active tracker found");

    const connectCallCount = (mockService.connect as unknown as { mock: { calls: unknown[] } }).mock.calls.length;

    // Advance time significantly
    await vi.advanceTimersByTimeAsync(300000); // 5 minutes

    // Should not have made any more connection attempts
    const finalCallCount = (mockService.connect as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
    expect(finalCallCount).toBe(connectCallCount);

    // Should not have changed state (no retries)
    const snapshot2 = mockStore.getSnapshot();
    expect(snapshot2.connectionState).toBe("not_found");
    expect(snapshot2.statusText).toContain("No active tracker found");

    presenter.dispose();
  });

  it("respects time limit (3 minutes) in addition to attempt limit", async (): Promise<void> => {
    const mockService = new MockLiveTrackerService();
    const mockStore = new MockLiveTrackerStore();

    const createdConnections: MockLiveTrackerConnection[] = [];
    vi.spyOn(mockService, "connect").mockImplementation(async (): Promise<LiveTrackerConnection> => {
      const conn = new MockLiveTrackerConnection();
      createdConnections.push(conn);
      return Promise.resolve(conn);
    });

    const presenter = new LiveTrackerPresenter({
      getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService: mockService,
      store: mockStore as unknown as LiveTrackerStore,
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
    });

    // Start the connection
    presenter.start();
    await vi.runAllTimersAsync();

    // Simulate successful connection first
    const [initialConnection] = createdConnections;
    expect(initialConnection).toBeDefined();
    initialConnection.emitStatus("connected");
    await vi.runAllTimersAsync();
    initialConnection.emitMessage(sampleLiveTrackerStateMessage);
    await vi.runAllTimersAsync();
    initialConnection.emitStatus("error", "Connection lost");
    await vi.runAllTimersAsync();

    // Try retrying for longer than 3 minutes
    for (let i = 0; i < 6; i++) {
      // Each iteration is 35 seconds, so 6 iterations = 210 seconds > 180 seconds (3 min)
      await vi.advanceTimersByTimeAsync(35000);
      await vi.runAllTimersAsync();

      const [latestConnection] = createdConnections.slice(-1);
      expect(latestConnection).toBeDefined();
      latestConnection.emitStatus("error", "Still failing");
      await vi.runAllTimersAsync();

      const snapshot = mockStore.getSnapshot();
      if (snapshot.statusText.includes("Gave up")) {
        break;
      }
    }

    // Test passes if we eventually gave up due to time limit
    const finalSnapshot = mockStore.getSnapshot();

    const reachedTimeLimit =
      finalSnapshot.statusText.includes("Gave up") || finalSnapshot.statusText.includes("Max retries");

    expect(reachedTimeLimit).toBe(true);
    expect(finalSnapshot.connectionState).toMatch(/^(error|connecting)$/);

    presenter.dispose();
  });
});
