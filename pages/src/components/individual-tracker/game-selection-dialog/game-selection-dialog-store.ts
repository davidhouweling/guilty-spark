import type { IndividualTrackerSeriesGroup } from "../series-group-metadata";
import type { TrackerMatchHistoryEntry } from "../../../services/individual-tracker/types";

export interface GameSelectionDialogSnapshot {
  readonly matches: readonly TrackerMatchHistoryEntry[] | null;
  readonly selectedMatchIds: ReadonlySet<string>;
  readonly groupings: readonly (readonly string[])[];
  readonly seriesGroups: readonly IndividualTrackerSeriesGroup[];
  readonly hasMore: boolean;
  readonly hideShortGames: boolean;
  readonly isSyncing: boolean;
  readonly hasActiveSeriesWarning: boolean;
  readonly errorMessage: string | null;
}

export class GameSelectionDialogStore {
  private snapshot: GameSelectionDialogSnapshot;
  private readonly subscribers = new Set<() => void>();

  public constructor() {
    this.snapshot = {
      matches: null,
      selectedMatchIds: new Set(),
      groupings: [],
      seriesGroups: [],
      hasMore: false,
      hideShortGames: true,
      isSyncing: false,
      hasActiveSeriesWarning: false,
      errorMessage: null,
    };
  }

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): GameSelectionDialogSnapshot {
    return this.snapshot;
  }

  public setMatches(matches: readonly TrackerMatchHistoryEntry[]): void {
    this.update({ matches });
  }

  public setSelectedMatchIds(selectedMatchIds: ReadonlySet<string>): void {
    this.update({ selectedMatchIds });
  }

  public setGroupings(groupings: readonly (readonly string[])[]): void {
    this.update({ groupings });
  }

  public setSeriesGroups(seriesGroups: readonly IndividualTrackerSeriesGroup[]): void {
    this.update({ seriesGroups });
  }

  public setHasMore(hasMore: boolean): void {
    this.update({ hasMore });
  }

  public setHideShortGames(hideShortGames: boolean): void {
    this.update({ hideShortGames });
  }

  public setSyncing(isSyncing: boolean): void {
    this.update({ isSyncing });
  }

  public setErrorMessage(errorMessage: string | null): void {
    this.update({ errorMessage });
  }

  public batchUpdate(partial: Partial<GameSelectionDialogSnapshot>): void {
    this.update(partial);
  }

  private update(partial: Partial<GameSelectionDialogSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
