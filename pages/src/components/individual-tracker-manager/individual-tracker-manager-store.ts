import type { Tracker } from "@guilty-spark/shared/contracts/individual-tracker/tracker";
import { ComponentLoaderStatus } from "../component-loader/component-loader";

export interface IndividualTrackerManagerSnapshot {
  readonly status: ComponentLoaderStatus;
  readonly errorMessage: string | null;
  readonly profileName: string;
  readonly trackers: readonly Tracker[];
  readonly gamertagInput: string;
  readonly addPending: boolean;
  readonly pendingTrackerId: string | null;
}

export class IndividualTrackerManagerStore {
  private snapshot: IndividualTrackerManagerSnapshot;
  private readonly subscribers = new Set<() => void>();

  public constructor() {
    this.snapshot = {
      status: ComponentLoaderStatus.LOADING,
      errorMessage: null,
      profileName: "",
      trackers: [],
      gamertagInput: "",
      addPending: false,
      pendingTrackerId: null,
    };
  }

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): IndividualTrackerManagerSnapshot {
    return this.snapshot;
  }

  public setLoading(): void {
    this.update({ status: ComponentLoaderStatus.LOADING, errorMessage: null });
  }

  public setLoaded(profileName: string, trackers: readonly Tracker[]): void {
    this.update({
      status: ComponentLoaderStatus.LOADED,
      errorMessage: null,
      profileName,
      trackers,
    });
  }

  public setError(errorMessage: string): void {
    this.update({ status: ComponentLoaderStatus.ERROR, errorMessage });
  }

  public setTrackers(trackers: readonly Tracker[]): void {
    this.update({ trackers });
  }

  public setGamertagInput(gamertagInput: string): void {
    this.update({ gamertagInput });
  }

  public setAddPending(addPending: boolean): void {
    this.update({ addPending });
  }

  public setPendingTrackerId(pendingTrackerId: string | null): void {
    this.update({ pendingTrackerId });
  }

  private update(partial: Partial<IndividualTrackerManagerSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
