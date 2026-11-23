import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GameVariantCategory } from "halo-infinite-api";
import { addMilliseconds, parseISO } from "date-fns";
import type { LiveTrackerMessage } from "@guilty-spark/shared/live-tracker/types";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import {
  aFakePlayerAssociationDataWith,
  sampleLiveTrackerStateMessage,
} from "@guilty-spark/shared/live-tracker/fakes/data";
import {
  aFakeMatchDetailWith,
  aFakeSeriesDetailResponseWith,
  aFakeSeriesTeamWith,
} from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { aFakeTeamWith } from "@guilty-spark/shared/contracts/stats/fakes/detail-primitives.fake";
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
import { LivePreSeriesCache } from "../../../services/live-pre-series/cache";
import type { LivePreSeriesService } from "../../../services/live-pre-series/types";
import {
  aFakeLivePreSeriesResponseWith,
  aFakeLivePreSeriesServiceWith,
} from "../../../services/live-pre-series/fakes/live-pre-series.fake";
import * as reconnectPolicy from "../../../services/base/reconnect-policy";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import type { LiveTrackerSnapshot } from "../live-tracker-store";
import type { LiveTrackerViewModel } from "../types";
import { SeriesDetailStatsViewModelPresenter } from "../../series-stats/series-detail-stats-view-model-presenter";
import { StatsDetailController } from "../../../controllers/stats/stats-detail-controller";

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
      livePreSeriesResponse: null,
      livePreSeriesStatus: ComponentLoaderStatus.PENDING,
      livePreSeriesError: null,
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
  readonly livePreSeriesService?: LivePreSeriesService;
}

function createPresenter({
  getUrl,
  liveTrackerService,
  store,
  matchAnalyticsService = aFakeMatchAnalyticsServiceWith(),
  seriesMatchesService = aFakeSeriesMatchesServiceWith(),
  livePreSeriesService = aFakeLivePreSeriesServiceWith(),
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
    livePreSeriesCache: new LivePreSeriesCache(livePreSeriesService),
    analyticsController,
  });
  target.presenter = presenter;
  return presenter;
}

function presentSnapshot(snapshot: LiveTrackerSnapshot): LiveTrackerViewModel {
  const detailModel =
    snapshot.seriesDetail == null
      ? null
      : new SeriesDetailStatsViewModelPresenter(new StatsDetailController()).present(
          snapshot.seriesDetail,
          snapshot.seriesAnalyticsByMatchId,
        );
  return LiveTrackerPresenter.present(snapshot, detailModel);
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
    const model = presentSnapshot({
      ...new MockLiveTrackerStore().getSnapshot(),
      seriesDetail: hasMatches
        ? aFakeSeriesDetailResponseWith({
            matches: {
              matchIds: ["first", "second"],
              results: ["first", "second"].map((matchId) => ({ status: "unavailable", matchId, reason: "not-found" })),
            },
          })
        : null,
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

describe("LiveTrackerPresenter captured pre-series data", () => {
  beforeEach((): void => {
    vi.useFakeTimers();
  });

  afterEach((): void => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not reuse a returning player's earlier capture during loading, failure or stop", async () => {
    const store = new MockLiveTrackerStore();
    const connection = new MockLiveTrackerConnection();
    const liveTrackerService = new MockLiveTrackerService();
    vi.spyOn(liveTrackerService, "connect").mockResolvedValue(connection);
    const { data } = sampleLiveTrackerStateMessage;
    const team = Preconditions.checkExists(data.teams[0]);
    const playerId = Preconditions.checkExists(team.playerIds[0]);
    const captured = aFakePlayerAssociationDataWith({ gamertag: "Captured player", currentRank: 1300 });
    const first = {
      ...sampleLiveTrackerStateMessage,
      data: {
        ...data,
        seriesStartedAt: "2026-11-06T00:00:00.000Z",
        substitutions: [],
        matchSummaries: [],
        players: [...data.players, { id: "replacement", discordUsername: "Replacement" }],
        playersAssociationData: { [playerId]: { ...captured, gamertag: "Broadcast player", currentRank: 1900 } },
      },
    };
    const response = aFakeLivePreSeriesResponseWith({
      guildId: data.guildId,
      queueNumber: data.queueNumber,
      seriesStartedAt: first.data.seriesStartedAt,
      players: [{ playerId, teamIndex: 0, rosterJoinedAt: first.data.seriesStartedAt, captured }],
    });
    const service = aFakeLivePreSeriesServiceWith(response);
    let rejectRefresh: ((error: Error) => void) | undefined;
    vi.spyOn(service, "getCapturedRoster")
      .mockResolvedValueOnce(response)
      .mockResolvedValueOnce(response)
      .mockImplementationOnce(
        async () =>
          new Promise((_resolve, reject) => {
            rejectRefresh = reject;
          }),
      );
    const presenter = createPresenter({
      getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService,
      store,
      livePreSeriesService: service,
    });
    presenter.start();
    await vi.runAllTimersAsync();
    connection.emitMessage(first);
    await vi.runAllTimersAsync();
    expect(presentSnapshot(store.getSnapshot()).livePreSeriesPlayersAssociationData?.[playerId]).toBe(captured);
    const wrongTeamModel = presentSnapshot({
      ...store.getSnapshot(),
      livePreSeriesResponse: {
        ...response,
        players: response.players.map((player) => ({ ...player, teamIndex: 1 })),
      },
    });
    expect(wrongTeamModel.livePreSeriesPlayersAssociationData?.[playerId]?.gamertag).toBeNull();
    const substitution = {
      playerOutId: playerId,
      playerInId: "replacement",
      teamIndex: 0,
      teamName: team.name,
      timestamp: "2026-11-06T00:01:00.000Z",
    };
    connection.emitMessage({
      ...first,
      data: {
        ...first.data,
        players: [...data.players, { id: "replacement", discordUsername: "Replacement" }],
        teams: data.teams.map((entry) => ({
          ...entry,
          playerIds: entry.playerIds.map((id) => (id === playerId ? "replacement" : id)),
        })),
        substitutions: [substitution],
      },
    });
    await vi.runAllTimersAsync();
    const rejoined = {
      ...first,
      data: {
        ...first.data,
        substitutions: [
          substitution,
          { ...substitution, playerOutId: "replacement", playerInId: playerId, timestamp: "2026-11-06T00:02:00.000Z" },
        ],
      },
    };
    connection.emitMessage(rejoined);
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().livePreSeriesStatus).toBe(ComponentLoaderStatus.LOADING);
    expect(presentSnapshot(store.getSnapshot()).livePreSeriesPlayersAssociationData?.[playerId]?.gamertag).toBeNull();
    Preconditions.checkExists(rejectRefresh)(new Error("capture refresh failed"));
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().livePreSeriesStatus).toBe(ComponentLoaderStatus.ERROR);
    expect(
      presentSnapshot(store.getSnapshot()).livePreSeriesPlayersAssociationData?.[playerId]?.currentRank,
    ).toBeNull();
    connection.emitMessage({ ...rejoined, data: { ...rejoined.data, status: "stopped" } });
    const model = presentSnapshot(store.getSnapshot());
    expect(model.livePreSeriesPlayersAssociationData?.[playerId]?.gamertag).toBeNull();
    expect(model.state?.playersAssociationData).toBe(first.data.playersAssociationData);
    expect(model.state?.playersAssociationData?.[playerId]?.currentRank).toBe(1900);
    presenter.dispose();
  });

  it("reloads captured data when substitutions and series scope change", async () => {
    const store = new MockLiveTrackerStore();
    const connection = new MockLiveTrackerConnection();
    const liveTrackerService = new MockLiveTrackerService();
    vi.spyOn(liveTrackerService, "connect").mockResolvedValue(connection);
    const service = aFakeLivePreSeriesServiceWith();
    const loadSpy = vi.spyOn(service, "getCapturedRoster");
    const first = {
      ...sampleLiveTrackerStateMessage,
      data: {
        ...sampleLiveTrackerStateMessage.data,
        seriesStartedAt: "2026-11-06T00:00:00.000Z",
        matchSummaries: [],
      },
    };
    const playerOut = Preconditions.checkExists(first.data.players[0]);
    const playerIn = Preconditions.checkExists(first.data.players[1]);
    const changed = {
      ...first,
      data: {
        ...first.data,
        seriesStartedAt: "2026-11-07T00:00:00.000Z",
        substitutions: [
          {
            playerOutId: playerOut.id,
            playerInId: playerIn.id,
            teamIndex: 0,
            teamName: Preconditions.checkExists(first.data.teams[0]).name,
            timestamp: "2026-11-07T00:01:00.000Z",
          },
        ],
      },
    };
    const presenter = createPresenter({
      getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService,
      store,
      livePreSeriesService: service,
    });
    presenter.start();
    await vi.runAllTimersAsync();
    connection.emitMessage(first);
    await vi.runAllTimersAsync();
    connection.emitMessage(changed);
    await vi.runAllTimersAsync();

    expect(loadSpy).toHaveBeenCalledTimes(2);
    presenter.dispose();
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

  it("preserves broadcast match scores when resolved detail has no configured mapping", () => {
    const summary = Preconditions.checkExists(sampleLiveTrackerStateMessage.data.matchSummaries[0]);
    const detail = aFakeMatchDetailWith({
      matchId: summary.matchId,
      teamCount: 2,
      teams: [aFakeTeamWith({ seriesTeamId: null }), aFakeTeamWith({ matchTeamId: 3, seriesTeamId: null })],
      score: {
        primary: {
          metric: "score",
          teams: [
            { matchTeamId: 3, seriesTeamId: null, value: 40 },
            { matchTeamId: 7, seriesTeamId: null, value: 50 },
          ],
        },
        secondary: null,
      },
    });
    const model = presentSnapshot({
      ...new MockLiveTrackerStore().getSnapshot(),
      lastStateMessage: {
        ...sampleLiveTrackerStateMessage,
        data: {
          ...sampleLiveTrackerStateMessage.data,
          matchSummaries: [{ ...summary, gameScore: "50:40", gameSubScore: "2:1" }],
        },
      },
      seriesDetail: aFakeSeriesDetailResponseWith({
        matches: { matchIds: [summary.matchId], results: [{ status: "resolved", matchId: summary.matchId, detail }] },
        aggregation: { status: "unavailable", reason: "ambiguous-team-mapping" },
      }),
    });
    expect(model.state?.matches[0]).toMatchObject({ gameScore: "50:40", gameSubScore: "2:1" });
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
    const livePreSeriesService = aFakeLivePreSeriesServiceWith();
    const preSeriesSpy = vi.spyOn(livePreSeriesService, "getCapturedRoster");
    const presenter = createPresenter({
      getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService: mockService,
      store: mockStore,
      seriesMatchesService,
      livePreSeriesService,
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
    expect(preSeriesSpy).not.toHaveBeenCalled();
    expect(presentSnapshot(mockStore.getSnapshot()).state?.playersAssociationData).toBe(data.playersAssociationData);

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
      data: {
        ...sampleLiveTrackerStateMessage.data,
        lastUpdateTime: "2025-01-01T00:01:00.000Z",
        seriesStartedAt: "2025-01-01T00:00:00.000Z",
      },
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

  it("clears retained detail during an earlier insertion and after its refresh fails", async () => {
    const store = new MockLiveTrackerStore();
    const connection = new MockLiveTrackerConnection();
    const liveTrackerService = new MockLiveTrackerService();
    vi.spyOn(liveTrackerService, "connect").mockResolvedValue(connection);
    const seriesMatchesService = aFakeSeriesMatchesServiceWith();
    let rejectRefresh: ((error: Error) => void) | undefined;
    const presenter = createPresenter({
      getUrl: () => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService,
      store,
      seriesMatchesService,
    });
    presenter.start();
    await vi.runAllTimersAsync();
    connection.emitMessage({
      ...sampleLiveTrackerStateMessage,
      data: {
        ...sampleLiveTrackerStateMessage.data,
        matchSummaries: sampleLiveTrackerStateMessage.data.matchSummaries.slice(1),
      },
    });
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().seriesDetail).not.toBeNull();
    vi.spyOn(seriesMatchesService, "getSeriesDetail").mockImplementationOnce(
      async () =>
        new Promise((_resolve, reject) => {
          rejectRefresh = reject;
        }),
    );
    connection.emitMessage(sampleLiveTrackerStateMessage);
    expect(store.getSnapshot().seriesDetailStatus).toBe(ComponentLoaderStatus.LOADING);
    expect(store.getSnapshot().seriesDetail).toBeNull();
    Preconditions.checkExists(rejectRefresh)(new Error("insertion refresh failed"));
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().seriesDetailStatus).toBe(ComponentLoaderStatus.ERROR);
    expect(store.getSnapshot().seriesDetail).toBeNull();
    presenter.dispose();
  });

  it("keeps the latest broadcast total while retained append detail is loading or failed", async () => {
    const store = new MockLiveTrackerStore();
    const connection = new MockLiveTrackerConnection();
    const liveTrackerService = new MockLiveTrackerService();
    vi.spyOn(liveTrackerService, "connect").mockResolvedValue(connection);
    const summary = Preconditions.checkExists(sampleLiveTrackerStateMessage.data.matchSummaries[0]);
    const message = {
      ...sampleLiveTrackerStateMessage,
      data: {
        ...sampleLiveTrackerStateMessage.data,
        substitutions: [
          {
            playerOutId: Preconditions.checkExists(sampleLiveTrackerStateMessage.data.players[0]).id,
            playerInId: Preconditions.checkExists(sampleLiveTrackerStateMessage.data.players[1]).id,
            teamIndex: 0,
            teamName: "Team 1",
            timestamp: addMilliseconds(parseISO(summary.endTime), 1).toISOString(),
          },
        ],
      },
    };
    const seriesMatchesService = aFakeSeriesMatchesServiceWith();
    const retainedDetail = aFakeSeriesDetailResponseWith({
      matches: {
        matchIds: [summary.matchId],
        results: [
          { status: "resolved", matchId: summary.matchId, detail: aFakeMatchDetailWith({ matchId: summary.matchId }) },
        ],
      },
      aggregation: {
        status: "resolved",
        gamesPlayed: 1,
        completedGameCount: 1,
        players: [],
        teams: [aFakeSeriesTeamWith({ gamesWon: 1 }), aFakeSeriesTeamWith({ seriesTeamId: 1, gamesWon: 0 })],
      },
    });
    let rejectRefresh: ((error: Error) => void) | undefined;
    vi.spyOn(seriesMatchesService, "getSeriesDetail")
      .mockResolvedValueOnce(retainedDetail)
      .mockImplementationOnce(
        async () =>
          new Promise((_resolve, reject) => {
            rejectRefresh = reject;
          }),
      );
    const presenter = createPresenter({
      getUrl: () => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService,
      store,
      seriesMatchesService,
    });
    presenter.start();
    await vi.runAllTimersAsync();
    connection.emitMessage({
      ...message,
      data: { ...message.data, matchSummaries: [summary] },
    });
    await vi.runAllTimersAsync();
    expect(presentSnapshot(store.getSnapshot()).state?.seriesScore).toBe("1:0");
    connection.emitMessage({
      ...message,
      data: { ...message.data, seriesScore: "2:0" },
    });
    expect(store.getSnapshot().seriesDetailStatus).toBe(ComponentLoaderStatus.LOADING);
    expect(store.getSnapshot().seriesDetail).toEqual(retainedDetail);
    expect(presentSnapshot(store.getSnapshot()).state?.seriesScore).toBe("2:0");
    expect(presentSnapshot(store.getSnapshot()).matchSubstitutions.trailing).toHaveLength(1);
    Preconditions.checkExists(rejectRefresh)(new Error("append refresh failed"));
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().seriesDetailStatus).toBe(ComponentLoaderStatus.ERROR);
    expect(store.getSnapshot().seriesDetail).toEqual(retainedDetail);
    expect(presentSnapshot(store.getSnapshot()).state?.seriesScore).toBe("2:0");
    expect(presentSnapshot(store.getSnapshot()).matchSubstitutions.trailing).toHaveLength(1);
    presenter.dispose();
  });

  it("retains final-match detail that resolves after the stopped connection closes", async () => {
    const store = new MockLiveTrackerStore();
    const connection = new MockLiveTrackerConnection();
    const liveTrackerService = new MockLiveTrackerService();
    const connectSpy = vi.spyOn(liveTrackerService, "connect").mockResolvedValue(connection);
    const seriesMatchesService = aFakeSeriesMatchesServiceWith();
    const detailSpy = vi.spyOn(seriesMatchesService, "getSeriesDetail");
    const presenter = createPresenter({
      getUrl: (): URL => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService,
      store,
      seriesMatchesService,
    });
    presenter.start();
    await vi.runAllTimersAsync();
    const { data } = sampleLiveTrackerStateMessage;
    connection.emitMessage({
      ...sampleLiveTrackerStateMessage,
      data: { ...data, rawMatches: {}, matchSummaries: data.matchSummaries.slice(0, 1) },
    });
    await vi.runAllTimersAsync();
    const initialDetail = store.getSnapshot().seriesDetail;
    let resolveFinal: ((value: Awaited<ReturnType<SeriesMatchesService["getSeriesDetail"]>>) => void) | undefined;
    detailSpy.mockImplementationOnce(
      async () =>
        new Promise((resolve) => {
          resolveFinal = resolve;
        }),
    );
    connection.emitMessage({
      ...sampleLiveTrackerStateMessage,
      data: { ...data, status: "stopped", rawMatches: {} },
    });
    connection.emitStatus("stopped");
    connection.disconnect();
    expect(store.getSnapshot().seriesDetail).toBe(initialDetail);
    expect(store.getSnapshot().seriesDetailStatus).toBe(ComponentLoaderStatus.LOADING);

    const matchIds = data.matchSummaries.map((match) => match.matchId);
    const finalDetail = await aFakeSeriesMatchesServiceWith().getSeriesDetail(
      `guild:${data.guildId}/queue/${data.queueNumber.toString()}`,
      matchIds,
    );
    Preconditions.checkExists(resolveFinal)(finalDetail);
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().connectionState).toBe("stopped");
    expect(store.getSnapshot().seriesDetailStatus).toBe(ComponentLoaderStatus.LOADED);
    expect(store.getSnapshot().seriesDetail?.matches.matchIds).toEqual(matchIds);
    expect(detailSpy).toHaveBeenCalledTimes(2);
    expect(connectSpy).toHaveBeenCalledOnce();
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
    expect(presentSnapshot(store.getSnapshot()).state?.plannedGames).toEqual([]);

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
    expect(presentSnapshot(store.getSnapshot()).state?.plannedGames).toEqual([
      expect.objectContaining({ gameNumber: 2, map: "Next Map" }),
    ]);
    presenter.dispose();
  });

  it("updates legacy icons and planned slots when only raw metadata arrives without refetching detail", async () => {
    const store = new MockLiveTrackerStore();
    const connection = new MockLiveTrackerConnection();
    const liveTrackerService = new MockLiveTrackerService();
    vi.spyOn(liveTrackerService, "connect").mockResolvedValue(connection);
    const seriesMatchesService = aFakeSeriesMatchesServiceWith();
    const detailSpy = vi.spyOn(seriesMatchesService, "getSeriesDetail");
    const presenter = createPresenter({
      getUrl: () => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService,
      store,
      seriesMatchesService,
    });
    const summary = Preconditions.checkExists(sampleLiveTrackerStateMessage.data.matchSummaries[0]);
    const message = {
      ...sampleLiveTrackerStateMessage,
      data: {
        ...sampleLiveTrackerStateMessage.data,
        rawMatches: {},
        matchSummaries: [{ ...summary, gameInfo: undefined }],
        plannedMaps: [{ mode: "Oddball", map: "Played" }],
      },
    };
    presenter.start();
    await vi.runAllTimersAsync();
    connection.emitMessage(message);
    await vi.runAllTimersAsync();
    expect(presentSnapshot(store.getSnapshot()).state?.plannedGames).toHaveLength(1);
    connection.emitMessage({
      ...message,
      data: {
        ...message.data,
        rawMatches: {
          [summary.matchId]: {
            MatchId: summary.matchId,
            Teams: [],
            Players: [],
            MatchInfo: {
              StartTime: summary.startTime,
              EndTime: summary.endTime,
              MapVariant: { AssetId: "map", VersionId: "v1" },
              GameVariantCategory: GameVariantCategory.MultiplayerOddball,
            },
          },
        },
      },
    });
    const { state } = presentSnapshot(store.getSnapshot());
    expect(state?.matches[0]?.gameInfo?.gameVariantCategory).toBe(GameVariantCategory.MultiplayerOddball);
    expect(state?.plannedGames).toEqual([]);
    expect(detailSpy).toHaveBeenCalledTimes(1);
    presenter.dispose();
  });

  it.each([false, true])(
    "shows Retry for partial fetch failures and retains usable detail (prior: %s)",
    async (hasPrior) => {
      const store = new MockLiveTrackerStore();
      const connection = new MockLiveTrackerConnection();
      const liveTrackerService = new MockLiveTrackerService();
      vi.spyOn(liveTrackerService, "connect").mockResolvedValue(connection);
      const seriesMatchesService = aFakeSeriesMatchesServiceWith();
      const presenter = createPresenter({
        getUrl: () => new URL("http://localhost/tracker?server=1&queue=3"),
        liveTrackerService,
        store,
        seriesMatchesService,
      });
      presenter.start();
      await vi.runAllTimersAsync();
      const summaries = sampleLiveTrackerStateMessage.data.matchSummaries;
      if (hasPrior) {
        connection.emitMessage({
          ...sampleLiveTrackerStateMessage,
          data: { ...sampleLiveTrackerStateMessage.data, matchSummaries: summaries.slice(0, 1) },
        });
        await vi.runAllTimersAsync();
      }
      const prior = store.getSnapshot().seriesDetail;
      const partial = aFakeSeriesDetailResponseWith({
        matches: {
          matchIds: summaries.map((match) => match.matchId),
          results: summaries.map(({ matchId }, index) =>
            index === summaries.length - 1
              ? { status: "unavailable", matchId, reason: "fetch-failed" }
              : { status: "resolved", matchId, detail: aFakeMatchDetailWith({ matchId }) },
          ),
        },
        aggregation: { status: "unavailable", reason: "incomplete-matches" },
      });
      const detailSpy = vi.spyOn(seriesMatchesService, "getSeriesDetail").mockResolvedValueOnce(partial);
      connection.emitMessage(sampleLiveTrackerStateMessage);
      await vi.runAllTimersAsync();
      expect(store.getSnapshot().seriesDetailStatus).toBe(ComponentLoaderStatus.ERROR);
      expect(store.getSnapshot().seriesDetailError).toBeTruthy();
      expect(store.getSnapshot().seriesDetail).toEqual(prior ?? partial);
      expect(presentSnapshot(store.getSnapshot()).allMatchStats.some((match) => match.data != null)).toBe(true);
      presenter.retrySeriesDetails();
      await vi.runAllTimersAsync();
      expect(detailSpy).toHaveBeenCalledTimes(2);
      expect(store.getSnapshot().seriesDetailStatus).toBe(ComponentLoaderStatus.LOADED);
      expect(store.getSnapshot().seriesDetailError).toBeNull();
      expect(store.getSnapshot().seriesDetail?.matches.matchIds).toEqual(partial.matches.matchIds);
      presenter.dispose();
    },
  );
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

  it("reports preflight and initial socket failures as errors rather than absence", async () => {
    const service = new MockLiveTrackerService();
    const store = new MockLiveTrackerStore();
    const connection = new MockLiveTrackerConnection();
    const error = new Error("forbidden");
    const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(service, "connect").mockRejectedValueOnce(error).mockResolvedValueOnce(connection);
    const presenter = createPresenter({
      getUrl: () => new URL("http://localhost/tracker?server=1&queue=3"),
      liveTrackerService: service,
      store,
    });

    presenter.start();
    await vi.runAllTimersAsync();
    expect(logError).toHaveBeenCalledWith("Failed to connect to live tracker:", error);
    expect(store.getSnapshot().connectionState).toBe("error");
    expect(store.getSnapshot().statusText).toBe("Unable to connect to tracker");

    presenter.start();
    await vi.runAllTimersAsync();
    connection.emitStatus("error", "Socket failed");
    expect(store.getSnapshot().connectionState).toBe("error");
    expect(store.getSnapshot().statusText).toBe("Socket failed");
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
