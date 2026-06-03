import type { MatchStats } from "halo-infinite-api";
import type { TrackerLiveView, TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { TrackerViewConnectionStatus } from "../../../services/individual-tracker/view-types";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";

export type MatchStatsState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly stats: MatchStats }
  | { readonly status: "error"; readonly message: string };

export interface IndividualTrackerViewerSnapshot {
  readonly status: ComponentLoaderStatus;
  readonly errorMessage: string | null;
  readonly view: TrackerViewState | null;
  readonly connectionStatus: TrackerViewConnectionStatus;
  readonly selectedMatchId: string | null;
  readonly matchStatsState: MatchStatsState | null;
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
      selectedMatchId: null,
      matchStatsState: null,
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
    this.update({ status: ComponentLoaderStatus.LOADED, view: { ...view, isLive } });
  }

  public setConnectionStatus(connectionStatus: TrackerViewConnectionStatus): void {
    this.update({ connectionStatus });
  }

  public setSelectedMatchId(id: string | null): void {
    this.update({ selectedMatchId: id, matchStatsState: id != null ? { status: "loading" } : null });
  }

  public setMatchStats(matchId: string, stats: MatchStats): void {
    if (this.snapshot.selectedMatchId !== matchId) {
      return;
    }
    this.update({ matchStatsState: { status: "loaded", stats } });
  }

  public setMatchStatsError(matchId: string, message: string): void {
    if (this.snapshot.selectedMatchId !== matchId) {
      return;
    }
    this.update({ matchStatsState: { status: "error", message } });
  }

  private update(partial: Partial<IndividualTrackerViewerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
