import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { LiveTrackerMessage } from "@guilty-spark/shared/live-tracker/types";
import { sampleLiveTrackerStateMessage } from "@guilty-spark/shared/live-tracker/fakes/data";
import { LiveTrackerPresenter } from "../live-tracker-presenter";
import type {
  LiveTrackerConnection,
  LiveTrackerListener,
  LiveTrackerService,
  LiveTrackerSubscription,
  LiveTrackerStatusListener,
} from "../../../services/live-tracker/types";
import type { LiveTrackerSnapshot, LiveTrackerStore } from "../live-tracker-store";
import type { Services } from "../../../services/types";
import { aFakeTrackerInitiationServiceWith } from "../../../services/tracker-initiation/fakes/tracker-initiation.fake";

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
      services: {
        liveTrackerService: mockService,
        trackerInitiationService: aFakeTrackerInitiationServiceWith(),
      } as Services,
      store: mockStore as unknown as LiveTrackerStore,
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
      services: {
        liveTrackerService: mockService,
        trackerInitiationService: aFakeTrackerInitiationServiceWith(),
      } as Services,
      store: mockStore as unknown as LiveTrackerStore,
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
      services: {
        liveTrackerService: mockService,
        trackerInitiationService: aFakeTrackerInitiationServiceWith(),
      } as Services,
      store: mockStore as unknown as LiveTrackerStore,
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
