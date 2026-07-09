import type {
  StatsHighlightItem,
  TrackerLiveMessageView,
  TrackerLiveView,
  TrackerMatchSummary,
  TrackerSeriesGroup,
  TrackerViewResponse,
  TrackerViewState,
} from "@guilty-spark/shared/contracts/individual-tracker/view";
import type {
  IndividualTrackerViewService,
  TrackerViewConnection,
  TrackerViewConnectionStatus,
  TrackerViewListener,
  TrackerViewStatusListener,
  TrackerViewSubscription,
} from "../view-types";

interface FakeMatchOverrides {
  readonly matchId?: string;
  readonly startTime?: string;
  readonly endTime?: string;
  readonly mapAssetId?: string;
  readonly mapVersionId?: string;
  readonly mapName?: string;
  readonly modeAssetId?: string;
  readonly gameVariantCategory?: number;
  readonly mapBackgroundUrl?: string;
  readonly outcome?: TrackerMatchSummary["outcome"];
  readonly score?: string;
  readonly killsDeathsAssistsKda?: string;
  readonly damageDealtTakenRatio?: string;
  readonly isMatchmaking?: boolean;
}

export function aFakeTrackerMatchSummaryWith(overrides: FakeMatchOverrides = {}): TrackerMatchSummary {
  return {
    matchId: overrides.matchId ?? "match-1",
    startTime: overrides.startTime ?? "2100-01-01T00:00:00.000Z",
    endTime: overrides.endTime ?? "2100-01-01T00:10:00.000Z",
    mapAssetId: overrides.mapAssetId ?? "map-asset-1",
    mapVersionId: overrides.mapVersionId ?? "map-version-1",
    mapName: overrides.mapName ?? "Live Fire",
    mapBackgroundUrl: overrides.mapBackgroundUrl ?? "data:,",
    modeAssetId: overrides.modeAssetId ?? "mode-asset-1",
    gameVariantCategory: overrides.gameVariantCategory ?? 6,
    outcome: overrides.outcome ?? "Win",
    score: overrides.score ?? "50:42",
    killsDeathsAssistsKda: overrides.killsDeathsAssistsKda ?? "10:7:4 (1.62)",
    damageDealtTakenRatio: overrides.damageDealtTakenRatio ?? "4,200:3,900 (1.08)",
    isMatchmaking: overrides.isMatchmaking ?? false,
  };
}

interface FakeSeriesOverrides {
  readonly id?: string;
  readonly matchIds?: readonly string[];
  readonly matchBackgroundUrls?: readonly string[];
  readonly score?: string;
  readonly title?: string;
  readonly subtitle?: string;
  readonly guildIconUrl?: string | null;
}

export function aFakeTrackerSeriesGroupWith(overrides: FakeSeriesOverrides = {}): TrackerSeriesGroup {
  return {
    id: overrides.id ?? "series-1",
    matchIds: [...(overrides.matchIds ?? ["match-1", "match-2"])],
    matchBackgroundUrls: [...(overrides.matchBackgroundUrls ?? ["data:,", "data:,"])],
    score: overrides.score ?? "2:1",
    title: overrides.title ?? "Series",
    subtitle: overrides.subtitle ?? "Best of 3",
    guildIconUrl: overrides.guildIconUrl ?? null,
  };
}

interface FakeLiveViewOverrides {
  readonly trackerId?: string;
  readonly gamertag?: string;
  readonly status?: TrackerLiveView["status"];
  readonly matches?: readonly TrackerMatchSummary[];
  readonly series?: readonly TrackerSeriesGroup[];
  readonly lastUpdateTime?: string;
  readonly lastMatchDiscoveredAt?: string | null;
  readonly hasActiveSeries?: boolean;
  readonly hasRecentCompletedSeries?: boolean;
  readonly activeSeriesContext?: TrackerLiveView["activeSeriesContext"];
}

export function aFakeTrackerLiveViewWith(overrides: FakeLiveViewOverrides = {}): TrackerLiveView {
  return {
    trackerId: overrides.trackerId ?? "fake-tracker-id",
    gamertag: overrides.gamertag ?? "Fake Spartan",
    status: overrides.status ?? "active",
    matches: [...(overrides.matches ?? [aFakeTrackerMatchSummaryWith()])],
    series: [...(overrides.series ?? [])],
    lastUpdateTime: overrides.lastUpdateTime ?? "2100-01-01T00:10:00.000Z",
    lastMatchDiscoveredAt: overrides.lastMatchDiscoveredAt ?? null,
    hasActiveSeries: overrides.hasActiveSeries ?? false,
    hasRecentCompletedSeries: overrides.hasRecentCompletedSeries ?? false,
    activeSeriesContext: overrides.activeSeriesContext,
  };
}

interface FakeViewStateOverrides extends FakeLiveViewOverrides {
  readonly isLive?: boolean;
  readonly statsHighlights?: readonly StatsHighlightItem[];
  readonly preSeriesPlayerInfo?: TrackerViewState["preSeriesPlayerInfo"];
}

export function aFakeTrackerViewStateWith(overrides: FakeViewStateOverrides = {}): TrackerViewState {
  return {
    ...aFakeTrackerLiveViewWith(overrides),
    isLive: overrides.isLive ?? true,
    ...(overrides.statsHighlights !== undefined ? { statsHighlights: [...overrides.statsHighlights] } : {}),
    ...(overrides.preSeriesPlayerInfo !== undefined ? { preSeriesPlayerInfo: overrides.preSeriesPlayerInfo } : {}),
  };
}

class FakeTrackerViewConnection implements TrackerViewConnection {
  private readonly listeners = new Set<TrackerViewListener>();
  private readonly statusListeners = new Set<TrackerViewStatusListener>();

  public subscribe(listener: TrackerViewListener): TrackerViewSubscription {
    this.listeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.listeners.delete(listener);
      },
    };
  }

  public subscribeStatus(listener: TrackerViewStatusListener): TrackerViewSubscription {
    this.statusListeners.add(listener);
    return {
      unsubscribe: (): void => {
        this.statusListeners.delete(listener);
      },
    };
  }

  public disconnect(): void {
    this.listeners.clear();
    this.statusListeners.clear();
  }

  public emitStatus(status: TrackerViewConnectionStatus, detail?: string): void {
    for (const listener of this.statusListeners) {
      listener(status, detail);
    }
  }

  public emitView(view: TrackerLiveMessageView): void {
    for (const listener of this.listeners) {
      listener(view);
    }

    if (view.status === "stopped") {
      this.emitStatus("stopped");
      this.disconnect();
    }
  }
}

interface FakeIndividualTrackerViewServiceOptions {
  readonly view: TrackerViewState;
}

export class FakeIndividualTrackerViewService implements IndividualTrackerViewService {
  private readonly view: TrackerViewState;
  public lastConnection: FakeTrackerViewConnection | null = null;

  public constructor(options?: Partial<FakeIndividualTrackerViewServiceOptions>) {
    this.view = options?.view ?? aFakeTrackerViewStateWith();
  }

  public async getView(): Promise<TrackerViewResponse> {
    await Promise.resolve();
    return { view: this.view };
  }

  public connect(): TrackerViewConnection {
    const connection = new FakeTrackerViewConnection();
    this.lastConnection = connection;
    return connection;
  }
}

export interface FakeIndividualTrackerViewServiceFactoryOpts {
  readonly view?: TrackerViewState;
}

export function aFakeIndividualTrackerViewServiceWith(
  opts: FakeIndividualTrackerViewServiceFactoryOpts = {},
): FakeIndividualTrackerViewService {
  return new FakeIndividualTrackerViewService({
    ...(opts.view !== undefined ? { view: opts.view } : {}),
  });
}
