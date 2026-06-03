import type { TrackerLiveView, TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { TrackerViewConnectionStatus } from "../../../services/individual-tracker/view-types";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";

export interface IndividualTrackerViewerSnapshot {
  readonly status: ComponentLoaderStatus;
  readonly errorMessage: string | null;
  readonly view: TrackerViewState | null;
  readonly connectionStatus: TrackerViewConnectionStatus;
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

  private update(partial: Partial<IndividualTrackerViewerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
