import type { LivePreSeriesResponse } from "@guilty-spark/shared/contracts/stats/pre-series";
import type { LiveTrackerMessage } from "@guilty-spark/shared/live-tracker/types";
import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import type { LiveTrackerConnectionStatus } from "../../services/live-tracker/types";
import type { SeriesMatchAnalyticsById } from "../series-stats/types";
import { ComponentLoaderStatus } from "../component-loader/component-loader";

export type LiveTrackerConnectionState = "idle" | LiveTrackerConnectionStatus;

export interface LiveTrackerParams {
  readonly type: "team";
  readonly server: string;
  readonly queue: string;
}

export interface LiveTrackerSnapshot {
  readonly params: LiveTrackerParams;
  readonly connectionState: LiveTrackerConnectionState;
  readonly statusText: string;
  readonly lastStateMessage: LiveTrackerMessage | null;
  readonly hasConnection: boolean;
  readonly hasReceivedInitialData: boolean;
  readonly seriesDetail: SeriesDetailResponse | null;
  readonly seriesDetailStatus: ComponentLoaderStatus;
  readonly seriesDetailError: string | null;
  readonly seriesAnalyticsByMatchId: SeriesMatchAnalyticsById;
  readonly livePreSeriesResponse: LivePreSeriesResponse | null;
  readonly livePreSeriesStatus: ComponentLoaderStatus;
  readonly livePreSeriesError: string | null;
}

export interface LiveTrackerStoreApi {
  getSnapshot(): LiveTrackerSnapshot;
  setSnapshot(next: LiveTrackerSnapshot): void;
}

export class LiveTrackerStore implements LiveTrackerStoreApi {
  private snapshot: LiveTrackerSnapshot;
  private readonly subscribers = new Set<() => void>();

  public constructor() {
    this.snapshot = {
      params: {
        type: "team",
        server: "",
        queue: "",
      },
      connectionState: "idle",
      statusText: "Waiting for query parameters",
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

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): LiveTrackerSnapshot {
    return this.snapshot;
  }

  public setSnapshot(next: LiveTrackerSnapshot): void {
    this.snapshot = next;
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
