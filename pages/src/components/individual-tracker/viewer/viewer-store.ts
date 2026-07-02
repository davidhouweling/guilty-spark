import type { TrackerLiveView, TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { TrackerViewConnectionStatus } from "../../../services/individual-tracker/view-types";
import type { MatchStatsData } from "../../../controllers/stats/types";
import type { KillMatrixPivotData } from "../../../controllers/stats/kill-matrix/types";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
import type { SeriesStatsViewModel } from "../../series-stats/types";
import type { ViewerEntryState } from "./types";

export interface MatchEntryLoadedState {
  readonly matchId: string;
  readonly gameVariantCategory: number;
  readonly gameMapThumbnailUrl: string;
  readonly duration: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly data: MatchStatsData[];
  readonly killMatrixPivotData: KillMatrixPivotData;
  readonly transposedKillMatrixPivotData: KillMatrixPivotData;
}

export interface SeriesEntryLoadedState {
  readonly seriesId: string;
  readonly viewModel: SeriesStatsViewModel;
}

export interface IndividualTrackerViewerSnapshot {
  readonly status: ComponentLoaderStatus;
  readonly errorMessage: string | null;
  readonly view: TrackerViewState | null;
  readonly connectionStatus: TrackerViewConnectionStatus;
  readonly refreshPending: boolean;
  readonly expandedEntryKeys: ReadonlySet<string>;
  readonly entryStates: ReadonlyMap<string, ViewerEntryState>;
}

export class IndividualTrackerViewerStore {
  private snapshot: IndividualTrackerViewerSnapshot;
  private readonly subscribers = new Set<() => void>();

  public constructor() {
    this.snapshot = {
      status: ComponentLoaderStatus.LOADING,
      errorMessage: null,
      view: null,
      connectionStatus: "connecting",
      refreshPending: false,
      expandedEntryKeys: new Set<string>(),
      entryStates: new Map<string, ViewerEntryState>(),
    };
  }

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): IndividualTrackerViewerSnapshot {
    return this.snapshot;
  }

  public setLoading(): void {
    this.update({ status: ComponentLoaderStatus.LOADING, errorMessage: null });
  }

  public setLoaded(view: TrackerViewState): void {
    this.update({ status: ComponentLoaderStatus.LOADED, errorMessage: null, view });
  }

  public setError(errorMessage: string): void {
    this.update({ status: ComponentLoaderStatus.ERROR, errorMessage });
  }

  public setView(view: TrackerLiveView): void {
    const isLive = this.snapshot.view?.isLive ?? false;
    const streamerSettings = this.snapshot.view?.streamerSettings;
    const statsHighlights = this.snapshot.view?.statsHighlights;
    const preSeriesPlayerInfo = this.snapshot.view?.preSeriesPlayerInfo;
    this.update({
      status: ComponentLoaderStatus.LOADED,
      view: { ...view, isLive, streamerSettings, statsHighlights, preSeriesPlayerInfo },
    });
  }

  public setConnectionStatus(connectionStatus: TrackerViewConnectionStatus): void {
    this.update({ connectionStatus });
  }

  public setRefreshState(refreshPending: boolean): void {
    this.update({ refreshPending });
  }

  public setEntryExpanded(key: string, expanded: boolean): void {
    const nextExpandedKeys = new Set(this.snapshot.expandedEntryKeys);
    if (expanded) {
      nextExpandedKeys.add(key);
    } else {
      nextExpandedKeys.delete(key);
    }
    this.update({ expandedEntryKeys: nextExpandedKeys });
  }

  public setEntryLoading(key: string, kind: "match" | "series"): void {
    const nextEntryStates = new Map(this.snapshot.entryStates);
    nextEntryStates.set(key, { kind, state: { status: "loading" } });
    this.update({ entryStates: nextEntryStates });
  }

  public setMatchEntryLoaded(key: string, state: MatchEntryLoadedState): void {
    const nextEntryStates = new Map(this.snapshot.entryStates);
    nextEntryStates.set(key, { kind: "match", state: { status: "loaded", ...state } });
    this.update({ entryStates: nextEntryStates });
  }

  public setSeriesEntryLoaded(key: string, state: SeriesEntryLoadedState): void {
    const nextEntryStates = new Map(this.snapshot.entryStates);
    nextEntryStates.set(key, { kind: "series", state: { status: "loaded", ...state } });
    this.update({ entryStates: nextEntryStates });
  }

  public setEntryError(key: string, kind: "match" | "series", message: string): void {
    const nextEntryStates = new Map(this.snapshot.entryStates);
    nextEntryStates.set(key, { kind, state: { status: "error", message } });
    this.update({ entryStates: nextEntryStates });
  }

  private update(partial: Partial<IndividualTrackerViewerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
