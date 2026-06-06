import type { IndividualTrackerSeriesGroup } from "../series-group-metadata";
import type { TrackerMatchHistoryEntry, TrackerSearchResult } from "../../../services/individual-tracker/types";

export interface AddTrackerDialogSnapshot {
  readonly query: string;
  readonly searching: boolean;
  readonly searchError: string | null;
  readonly result: TrackerSearchResult | null;
  readonly matches: readonly TrackerMatchHistoryEntry[];
  readonly activeGroupings: readonly (readonly string[])[];
  readonly loadingMatches: boolean;
  readonly hasMore: boolean;
  readonly selectedMatchIds: readonly string[];
  readonly seriesGroups: readonly IndividualTrackerSeriesGroup[];
  readonly hideShortGames: boolean;
  readonly busy: boolean;
}

export class AddTrackerDialogStore {
  private snapshot: AddTrackerDialogSnapshot;
  private readonly subscribers = new Set<() => void>();

  public constructor() {
    this.snapshot = {
      query: "",
      searching: false,
      searchError: null,
      result: null,
      matches: [],
      activeGroupings: [],
      loadingMatches: false,
      hasMore: false,
      selectedMatchIds: [],
      seriesGroups: [],
      hideShortGames: true,
      busy: false,
    };
  }

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): AddTrackerDialogSnapshot {
    return this.snapshot;
  }

  public setQuery(query: string): void {
    this.update({ query });
  }

  public setSearching(searching: boolean): void {
    this.update({ searching });
  }

  public setSearchError(searchError: string | null): void {
    this.update({ searchError });
  }

  public setResult(result: TrackerSearchResult | null): void {
    this.update({ result });
  }

  public setMatches(matches: readonly TrackerMatchHistoryEntry[]): void {
    this.update({ matches });
  }

  public setActiveGroupings(activeGroupings: readonly (readonly string[])[]): void {
    this.update({ activeGroupings });
  }

  public setLoadingMatches(loadingMatches: boolean): void {
    this.update({ loadingMatches });
  }

  public setHasMore(hasMore: boolean): void {
    this.update({ hasMore });
  }

  public setSelectedMatchIds(selectedMatchIds: readonly string[]): void {
    this.update({ selectedMatchIds });
  }

  public setSeriesGroups(seriesGroups: readonly IndividualTrackerSeriesGroup[]): void {
    this.update({ seriesGroups });
  }

  public setHideShortGames(hideShortGames: boolean): void {
    this.update({ hideShortGames });
  }

  public setBusy(busy: boolean): void {
    this.update({ busy });
  }

  public batchUpdate(partial: Partial<AddTrackerDialogSnapshot>): void {
    this.update(partial);
  }

  private update(partial: Partial<AddTrackerDialogSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
