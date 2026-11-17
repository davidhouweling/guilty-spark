import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { LiveTrackerMessage } from "@guilty-spark/shared/live-tracker/types";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { sampleLiveTrackerStateMessage } from "@guilty-spark/shared/live-tracker/fakes/data";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import { LiveTrackerPresenter } from "../live-tracker-presenter";
import { SeriesAnalyticsController } from "../../../controllers/series-analytics/series-analytics-controller";
import type {
  LiveTrackerConnection,
  LiveTrackerListener,
  LiveTrackerService,
  LiveTrackerSubscription,
  LiveTrackerStatusListener,
} from "../../../services/live-tracker/types";
import { aFakeMatchAnalyticsServiceWith } from "../../../services/stats/fakes/match-analytics.fake";
import { aFakeSeriesMatchesServiceWith } from "../../../services/series-matches/fakes/series-matches.fake";
import type { SeriesMatchesService } from "../../../services/series-matches/types";
import * as reconnectPolicy from "../../../services/base/reconnect-policy";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import type { LiveTrackerSnapshot } from "../live-tracker-store";

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
      seriesDetail: null,
      seriesDetailStatus: ComponentLoaderStatus.PENDING,
      seriesDetailError: null,
      seriesAnalyticsByMatchId: new Map(),
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

interface PresenterFactoryOptions {
  readonly getUrl: () => URL;
  readonly liveTrackerService: LiveTrackerService;
  readonly store: MockLiveTrackerStore;
  readonly matchAnalyticsService?: MatchAnalyticsService;
  readonly seriesMatchesService?: SeriesMatchesService;
}

function createPresenter({
  getUrl,
  liveTrackerService,
  store,
  matchAnalyticsService = aFakeMatchAnalyticsServiceWith(),
  seriesMatchesService = aFakeSeriesMatchesServiceWith(),
}: PresenterFactoryOptions): LiveTrackerPresenter {
  const target: { presenter?: LiveTrackerPresenter | undefined } = {};
  const analyticsController = new SeriesAnalyticsController({
    matchAnalyticsService,
    onChange: (analyticsByMatchId): void => {
      target.presenter?.setAnalytics(analyticsByMatchId);
    },
  });
  const presenter = new LiveTrackerPresenter({
    getUrl,
    liveTrackerService,
    store,
    seriesMatchesService,
    analyticsController,
  });
  target.presenter = presenter;
  return presenter;
}

describe("LiveTrackerPresenter substitution framing", () => {
  it.each([true, false])("groups chronological notices around completed matches (matches: %s)", (hasMatches) => {
    const summary = Preconditions.checkExists(sampleLiveTrackerStateMessage.data.matchSummaries[0]);
    const timestamps = [
      "2025-01-01T00:25:00.000Z",
      "2025-01-01T00:05:00.000Z",
      "2025-01-01T00:10:00.000Z",
      "2025-01-01T00:15:00.000Z",
    ];
    const model = LiveTrackerPresenter.present({
      ...new MockLiveTrackerStore().getSnapshot(),
      lastStateMessage: {
        ...sampleLiveTrackerStateMessage,
        data: {
          ...sampleLiveTrackerStateMessage.data,
          players: [
            { id: "out", discordUsername: "Original" },
            { id: "in", discordUsername: "Replacement" },
          ],
          teams: [{ name: "Team", playerIds: ["in"] }],
          substitutions: timestamps.map((timestamp) => ({
            playerOutId: "out",
            playerInId: "in",
            teamIndex: 0,
            teamName: "Team",
            timestamp,
          })),
          matchSummaries: hasMatches
            ? [
                { ...summary, matchId: "second", endTime: "2025-01-01T00:20:00.000Z" },
                { ...summary, matchId: "first", endTime: "2025-01-01T00:10:00.000Z" },
              ]
            : [],
          rawMatches: {},
          plannedMaps: [],
        },
      },
    });
    expect(model.matchSubstitutions.byMatchId.get("first")?.map((notice) => notice.timestamp)).toEqual(
      hasMatches ? timestamps.slice(1, 3) : undefined,
    );
    expect(model.matchSubstitutions.byMatchId.get("second")?.map((notice) => notice.timestamp)).toEqual(
      hasMatches ? timestamps.slice(3) : undefined,
    );
    expect(model.matchSubstitutions.trailing.map((notice) => notice.timestamp)).toEqual(
      hasMatches ? timestamps.slice(0, 1) : [...timestamps].sort(),
    );
  });
});

describe("LiveTrackerPresenter live detail integration", () => {
  beforeEach((): void => {
    vi.useFakeTimers();
  });

  afterEach((): void => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("loads condensed detail with the configured live display context and no credential hint", async (): Promise<void> => {
    const mockStore = new MockLiveTrackerStore();
    const createdConnections: MockLiveTrackerConnection[] = [];
    const mockService = new MockLiveTrackerService();
    vi.spyOn(mockService, "connect").mockImplementation(async (): Promise<LiveTrackerConnection> => {
      const conn = new MockLiveTrackerConnection();
      createdConnections.push(conn);
      return Promise.resolve(conn);
    });
    const seriesMatchesService = aFakeSeriesMatchesServiceWith();
    const detailSpy = vi.spyOn(seriesMatchesService, "getSeriesDetail");
    const presenter = createPresenter({
      getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService: mockService,
      store: mockStore,
      seriesMatchesService,
    });

    presenter.start();
    await vi.runAllTimersAsync();

    const connection = Preconditions.checkExists(createdConnections[0]);
    connection.emitStatus("connected");
    connection.emitMessage(sampleLiveTrackerStateMessage);
    await vi.runAllTimersAsync();

    const { data } = sampleLiveTrackerStateMessage;
    expect(detailSpy).toHaveBeenCalledTimes(1);
    expect(detailSpy).toHaveBeenCalledWith(
      `guild:${data.guildId}/queue/${data.queueNumber.toString()}`,
      data.matchSummaries.map((match) => match.matchId),
      undefined,
      undefined,
      {
        teams: data.teams.map(({ name, playerIds }) => ({ name, playerIds })),
        playersAssociationData: Object.fromEntries(
          Object.entries(data.playersAssociationData ?? {}).map(([id, value]) => [id, { xboxId: value.xboxId }]),
        ),
        substitutions: data.substitutions.map(({ playerOutId, playerInId, teamIndex, timestamp }) => ({
          playerOutId,
          playerInId,
          teamIndex,
          timestamp,
        })),
      },
    );
    expect(mockStore.getSnapshot().seriesDetailStatus).toBe(ComponentLoaderStatus.LOADED);

    presenter.dispose();
  });

  it("does not refetch for heartbeat changes but refetches when match IDs or configured context changes", async (): Promise<void> => {
    const mockStore = new MockLiveTrackerStore();
    const createdConnections: MockLiveTrackerConnection[] = [];
    const mockService = new MockLiveTrackerService();
    vi.spyOn(mockService, "connect").mockImplementation(async (): Promise<LiveTrackerConnection> => {
      const conn = new MockLiveTrackerConnection();
      createdConnections.push(conn);
      return Promise.resolve(conn);
    });
    const seriesMatchesService = aFakeSeriesMatchesServiceWith();
    const detailSpy = vi.spyOn(seriesMatchesService, "getSeriesDetail");
    const presenter = createPresenter({
      getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService: mockService,
      store: mockStore,
      seriesMatchesService,
    });

    presenter.start();
    await vi.runAllTimersAsync();

    const connection = Preconditions.checkExists(createdConnections[0]);
    connection.emitStatus("connected");
    connection.emitMessage(sampleLiveTrackerStateMessage);
    await vi.runAllTimersAsync();

    connection.emitMessage({
      ...sampleLiveTrackerStateMessage,
      timestamp: "2025-01-01T00:01:00.000Z",
      data: { ...sampleLiveTrackerStateMessage.data, lastUpdateTime: "2025-01-01T00:01:00.000Z" },
    });
    await vi.runAllTimersAsync();
    expect(detailSpy).toHaveBeenCalledTimes(1);

    const { data } = sampleLiveTrackerStateMessage;
    connection.emitMessage({
      ...sampleLiveTrackerStateMessage,
      data: { ...data, matchSummaries: data.matchSummaries.slice(0, -1) },
    });
    await vi.runAllTimersAsync();
    expect(detailSpy).toHaveBeenCalledTimes(2);

    const latestData = {
      ...data,
      matchSummaries: data.matchSummaries.slice(0, -1),
      teams: data.teams.map((team, index) => (index === 0 ? { ...team, name: "Updated" } : team)),
    };
    connection.emitMessage({ ...sampleLiveTrackerStateMessage, data: latestData });
    await vi.runAllTimersAsync();
    expect(detailSpy).toHaveBeenCalledTimes(3);

    presenter.dispose();
  });

  it("retries failed detail requests and ignores responses from replaced sources", async (): Promise<void> => {
    const store = new MockLiveTrackerStore();
    const connection = new MockLiveTrackerConnection();
    const liveTrackerService = new MockLiveTrackerService();
    vi.spyOn(liveTrackerService, "connect").mockResolvedValue(connection);
    const seriesMatchesService = aFakeSeriesMatchesServiceWith();
    const detailSpy = vi.spyOn(seriesMatchesService, "getSeriesDetail");
    let resolveOld: ((value: Awaited<ReturnType<SeriesMatchesService["getSeriesDetail"]>>) => void) | undefined;
    detailSpy.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    detailSpy.mockRejectedValueOnce(new Error("detail unavailable"));
    const presenter = createPresenter({
      getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService,
      store,
      seriesMatchesService,
    });

    presenter.start();
    await vi.runAllTimersAsync();
    connection.emitMessage(sampleLiveTrackerStateMessage);
    const changedMessage = {
      ...sampleLiveTrackerStateMessage,
      data: {
        ...sampleLiveTrackerStateMessage.data,
        teams: sampleLiveTrackerStateMessage.data.teams.map((team, index) =>
          index === 0 ? { ...team, name: "Changed team" } : team,
        ),
      },
    };
    connection.emitMessage(changedMessage);
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().seriesDetailStatus).toBe(ComponentLoaderStatus.ERROR);

    presenter.retrySeriesDetails();
    await vi.runAllTimersAsync();
    resolveOld?.(
      await aFakeSeriesMatchesServiceWith().getSeriesDetail("old", ["old"], undefined, undefined, {
        teams: [
          { name: "one", playerIds: ["one"] },
          { name: "two", playerIds: ["two"] },
        ],
        playersAssociationData: {},
        substitutions: [],
      }),
    );
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().seriesDetailStatus).toBe(ComponentLoaderStatus.LOADED);
    expect(store.getSnapshot().seriesDetail?.seriesId).toBe(
      `guild:${sampleLiveTrackerStateMessage.data.guildId}/queue/${sampleLiveTrackerStateMessage.data.queueNumber.toString()}`,
    );
    presenter.dispose();
  });

  it("updates planned games when only persisted game metadata changes", async () => {
    const store = new MockLiveTrackerStore();
    const connection = new MockLiveTrackerConnection();
    const liveTrackerService = new MockLiveTrackerService();
    vi.spyOn(liveTrackerService, "connect").mockResolvedValue(connection);
    const presenter = createPresenter({
      getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService,
      store,
    });
    const first = Preconditions.checkExists(sampleLiveTrackerStateMessage.data.matchSummaries.at(0));
    const second = Preconditions.checkExists(sampleLiveTrackerStateMessage.data.matchSummaries.at(1));
    const gameInfo = { mapAssetId: "map-a", mapVersionId: "v1", gameVariantCategory: 1 };
    const message = {
      ...sampleLiveTrackerStateMessage,
      data: {
        ...sampleLiveTrackerStateMessage.data,
        rawMatches: {},
        matchSummaries: [
          { ...first, gameInfo },
          { ...second, gameInfo: { ...gameInfo, mapVersionId: "v2" } },
        ],
        plannedMaps: [
          { mode: "Slayer", map: "Played Map" },
          { mode: "Oddball", map: "Next Map" },
        ],
      },
    };
    presenter.start();
    await vi.runAllTimersAsync();
    connection.emitMessage(message);
    expect(LiveTrackerPresenter.present(store.getSnapshot()).state?.plannedGames).toEqual([]);

    connection.emitMessage({
      ...message,
      data: {
        ...message.data,
        matchSummaries: [
          { ...first, gameInfo },
          { ...second, gameInfo },
        ],
      },
    });
    expect(LiveTrackerPresenter.present(store.getSnapshot()).state?.plannedGames).toEqual([
      expect.objectContaining({ gameNumber: 2, map: "Next Map" }),
    ]);
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

    const presenter = createPresenter({
      getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService: mockService,
      store: mockStore,
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

    const createdConnections: MockLiveTrackerConnection[] = [];
    const connectSpy = vi.spyOn(mockService, "connect").mockImplementation(async (): Promise<LiveTrackerConnection> => {
      const conn = new MockLiveTrackerConnection();
      createdConnections.push(conn);
      return Promise.resolve(conn);
    });

    const presenter = createPresenter({
      getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService: mockService,
      store: mockStore,
    });

    // Start the connection
    presenter.start();
    await vi.runAllTimersAsync();

    // Simulate 404 not found status on initial connection
    const connection = Preconditions.checkExists(createdConnections[0]);
    connection.emitStatus("not_found");
    await vi.runAllTimersAsync();

    const snapshot1 = mockStore.getSnapshot();
    expect(snapshot1.connectionState).toBe("not_found");
    expect(snapshot1.statusText).toContain("No active tracker found");

    const connectCallCount = connectSpy.mock.calls.length;

    // Advance time significantly
    await vi.advanceTimersByTimeAsync(300000); // 5 minutes

    // Should not have made any more connection attempts
    const finalCallCount = connectSpy.mock.calls.length;
    expect(finalCallCount).toBe(connectCallCount);

    // Should not have changed state (no retries)
    const snapshot2 = mockStore.getSnapshot();
    expect(snapshot2.connectionState).toBe("not_found");
    expect(snapshot2.statusText).toContain("No active tracker found");

    presenter.dispose();
  });

  it("uses shared reconnect delay and ignores duplicate error events while a retry is pending", async (): Promise<void> => {
    const reconnectDelaySpy = vi.spyOn(reconnectPolicy, "getReconnectDelayMs").mockReturnValue(1_000);

    try {
      const mockService = new MockLiveTrackerService();
      const mockStore = new MockLiveTrackerStore();

      const createdConnections: MockLiveTrackerConnection[] = [];
      const connectSpy = vi
        .spyOn(mockService, "connect")
        .mockImplementation(async (): Promise<LiveTrackerConnection> => {
          const conn = new MockLiveTrackerConnection();
          createdConnections.push(conn);
          return Promise.resolve(conn);
        });

      const presenter = createPresenter({
        getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
        liveTrackerService: mockService,
        store: mockStore,
      });

      presenter.start();
      await vi.runAllTimersAsync();

      const initialConnection = Preconditions.checkExists(createdConnections[0]);
      initialConnection.emitStatus("connected");
      await vi.runAllTimersAsync();
      initialConnection.emitMessage(sampleLiveTrackerStateMessage);
      await vi.runAllTimersAsync();

      initialConnection.emitStatus("error", "Connection lost");
      initialConnection.emitStatus("error", "Connection lost again");

      expect(reconnectDelaySpy).toHaveBeenCalledTimes(1);
      expect(connectSpy).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_000);
      await vi.runAllTimersAsync();

      expect(connectSpy).toHaveBeenCalledTimes(2);

      presenter.dispose();
    } finally {
      reconnectDelaySpy.mockRestore();
    }
  });

  it("respects time limit (3 minutes) in addition to attempt limit", async (): Promise<void> => {
    const reconnectDelaySpy = vi.spyOn(reconnectPolicy, "getReconnectDelayMs").mockReturnValue(35_000);

    try {
      const mockService = new MockLiveTrackerService();
      const mockStore = new MockLiveTrackerStore();

      const createdConnections: MockLiveTrackerConnection[] = [];
      vi.spyOn(mockService, "connect").mockImplementation(async (): Promise<LiveTrackerConnection> => {
        const conn = new MockLiveTrackerConnection();
        createdConnections.push(conn);
        return Promise.resolve(conn);
      });

      const presenter = createPresenter({
        getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
        liveTrackerService: mockService,
        store: mockStore,
      });

      presenter.start();
      await vi.runAllTimersAsync();

      const [initialConnection] = createdConnections;
      expect(initialConnection).toBeDefined();
      initialConnection.emitStatus("connected");
      await vi.runAllTimersAsync();
      initialConnection.emitMessage(sampleLiveTrackerStateMessage);
      await vi.runAllTimersAsync();
      initialConnection.emitStatus("error", "Connection lost");
      await vi.runAllTimersAsync();

      for (let i = 0; i < 6; i++) {
        await vi.advanceTimersByTimeAsync(35_000);
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

      const finalSnapshot = mockStore.getSnapshot();

      expect(finalSnapshot.statusText.includes("Gave up")).toBe(true);
      expect(finalSnapshot.connectionState).toBe("error");

      presenter.dispose();
    } finally {
      reconnectDelaySpy.mockRestore();
    }
  });

  it("gives up when the time limit is exceeded before a pending retry fires", async (): Promise<void> => {
    const reconnectDelaySpy = vi.spyOn(reconnectPolicy, "getReconnectDelayMs").mockReturnValue(60_000);

    try {
      vi.setSystemTime(0);

      const mockService = new MockLiveTrackerService();
      const mockStore = new MockLiveTrackerStore();

      const createdConnections: MockLiveTrackerConnection[] = [];
      vi.spyOn(mockService, "connect").mockImplementation(async (): Promise<LiveTrackerConnection> => {
        const conn = new MockLiveTrackerConnection();
        createdConnections.push(conn);
        return Promise.resolve(conn);
      });

      const presenter = createPresenter({
        getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
        liveTrackerService: mockService,
        store: mockStore,
      });

      presenter.start();
      await vi.runAllTimersAsync();

      const firstConnection = Preconditions.checkExists(createdConnections[0]);
      firstConnection.emitStatus("connected");
      await vi.runAllTimersAsync();
      firstConnection.emitMessage(sampleLiveTrackerStateMessage);
      await vi.runAllTimersAsync();

      firstConnection.emitStatus("error", "Connection lost");
      await vi.runAllTimersAsync();

      const secondConnection = Preconditions.checkExists(createdConnections[1]);
      secondConnection.emitStatus("error", "Still failing");
      await vi.runAllTimersAsync();

      const thirdConnection = Preconditions.checkExists(createdConnections[2]);
      await vi.advanceTimersByTimeAsync(1);
      thirdConnection.emitStatus("error", "Still failing");

      await vi.advanceTimersByTimeAsync(60_001);
      await vi.runAllTimersAsync();

      expect(createdConnections).toHaveLength(3);
      expect(mockStore.getSnapshot().statusText).toContain("Gave up after 3m");

      presenter.dispose();
    } finally {
      reconnectDelaySpy.mockRestore();
    }
  });
});
