import type { IndividualTrackerSeriesGroup } from "../series-group-metadata";
import type {
  IndividualTrackerService,
  TrackerMatchHistoryEntry,
  TrackerSearchResult,
} from "../../../services/individual-tracker/types";
import { applyAddToAdjacentGroup, applyBreakFromGroup } from "../grouping-utils";
import { alignSeriesGroupsToGroupings } from "../series-group-metadata";
import { shouldHideShortDurationMatch } from "../match-duration-filter";
import type { AddTrackerDialogSnapshot, AddTrackerDialogStore } from "./add-tracker-dialog-store";

const MATCH_PAGE_SIZE = 25;

interface Config {
  readonly store: AddTrackerDialogStore;
  readonly individualTrackerService: IndividualTrackerService;
  readonly onTrackerStarted: () => void;
}

export interface AddTrackerDialogViewModel {
  readonly query: string;
  readonly searching: boolean;
  readonly searchError: string | null;
  readonly result: TrackerSearchResult | null;
  readonly visibleMatches: readonly TrackerMatchHistoryEntry[] | null;
  readonly activeGroupings: readonly (readonly string[])[];
  readonly loadingMatches: boolean;
  readonly hasMore: boolean;
  readonly selectedMatchIds: ReadonlySet<string>;
  readonly seriesGroups: readonly IndividualTrackerSeriesGroup[];
  readonly hideShortGames: boolean;
  readonly busy: boolean;
  readonly canStart: boolean;
}

export class AddTrackerDialogPresenter {
  private readonly config: Config;
  private isDisposed = false;

  public constructor(config: Config) {
    this.config = config;
  }

  public static present(snapshot: AddTrackerDialogSnapshot): AddTrackerDialogViewModel {
    const selectedMatchIds = new Set(snapshot.selectedMatchIds);
    const visibleMatches =
      snapshot.loadingMatches && snapshot.matches.length === 0
        ? null
        : snapshot.hideShortGames
          ? snapshot.matches.filter((entry) => !shouldHideShortDurationMatch(entry))
          : snapshot.matches;
    return {
      query: snapshot.query,
      searching: snapshot.searching,
      searchError: snapshot.searchError,
      result: snapshot.result,
      visibleMatches,
      activeGroupings: snapshot.activeGroupings,
      loadingMatches: snapshot.loadingMatches,
      hasMore: snapshot.hasMore,
      selectedMatchIds,
      seriesGroups: snapshot.seriesGroups,
      hideShortGames: snapshot.hideShortGames,
      busy: snapshot.busy,
      canStart: snapshot.result != null && !snapshot.busy,
    };
  }

  public dispose(): void {
    this.isDisposed = true;
  }

  public reset(): void {
    if (this.isDisposed) {
      return;
    }
    this.config.store.batchUpdate({
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
    });
  }

  public setQuery(query: string): void {
    if (this.isDisposed) {
      return;
    }
    this.config.store.setQuery(query);
  }

  public search(): void {
    if (this.isDisposed) {
      return;
    }
    const snapshot = this.config.store.getSnapshot();
    const normalized = snapshot.query.trim();
    if (normalized === "" || snapshot.searching || snapshot.loadingMatches) {
      return;
    }
    this.config.store.batchUpdate({ searching: true, searchError: null });
    this.runSearch(normalized);
  }

  public async loadMore(): Promise<void> {
    if (this.isDisposed) {
      return Promise.resolve();
    }
    const snapshot = this.config.store.getSnapshot();
    if (snapshot.result == null || snapshot.loadingMatches) {
      return Promise.resolve();
    }
    this.config.store.setLoadingMatches(true);
    return this.doLoadMore(snapshot.result.xuid, snapshot.matches.length);
  }

  public toggleMatch(matchId: string): void {
    if (this.isDisposed) {
      return;
    }
    const { selectedMatchIds } = this.config.store.getSnapshot();
    const next = selectedMatchIds.includes(matchId)
      ? selectedMatchIds.filter((id) => id !== matchId)
      : [...selectedMatchIds, matchId];
    this.config.store.setSelectedMatchIds(next);
  }

  public breakGroup(matchId: string): void {
    if (this.isDisposed) {
      return;
    }
    const { activeGroupings, matches } = this.config.store.getSnapshot();
    const nextGroupings = applyBreakFromGroup(activeGroupings, matches, matchId);
    this.applyGroupingsUpdate(nextGroupings);
  }

  public addToGroup(matchId: string, direction: "above" | "below"): void {
    if (this.isDisposed) {
      return;
    }
    const { activeGroupings, matches } = this.config.store.getSnapshot();
    const nextGroupings = applyAddToAdjacentGroup(activeGroupings, matches, matchId, direction);
    this.applyGroupingsUpdate(nextGroupings);
  }

  public setHideShortGames(hideShortGames: boolean): void {
    if (this.isDisposed) {
      return;
    }
    this.config.store.setHideShortGames(hideShortGames);
  }

  public setSeriesGroupTitle(groupIndex: number, value: string | null): void {
    if (this.isDisposed) {
      return;
    }
    const { seriesGroups } = this.config.store.getSnapshot();
    const next = seriesGroups.map((group, index) =>
      index === groupIndex ? { ...group, titleOverride: value } : group,
    );
    this.config.store.setSeriesGroups(next);
  }

  public setSeriesGroupSubtitle(groupIndex: number, value: string | null): void {
    if (this.isDisposed) {
      return;
    }
    const { seriesGroups } = this.config.store.getSnapshot();
    const next = seriesGroups.map((group, index) =>
      index === groupIndex ? { ...group, subtitleOverride: value } : group,
    );
    this.config.store.setSeriesGroups(next);
  }

  public startTracker(): void {
    if (this.isDisposed) {
      return;
    }
    const snapshot = this.config.store.getSnapshot();
    if (snapshot.result == null || snapshot.busy) {
      return;
    }
    this.config.store.setBusy(true);
    this.runStartTracker(snapshot.result.gamertag);
  }

  private applyGroupingsUpdate(nextGroupings: readonly (readonly string[])[]): void {
    const { seriesGroups } = this.config.store.getSnapshot();
    const nextSeriesGroups = alignSeriesGroupsToGroupings(nextGroupings, seriesGroups);
    this.config.store.batchUpdate({
      activeGroupings: nextGroupings,
      seriesGroups: nextSeriesGroups,
    });
  }

  private runSearch(gamertag: string): void {
    void this.doSearch(gamertag);
  }

  private async doSearch(gamertag: string): Promise<void> {
    try {
      const found = await this.config.individualTrackerService.searchGamertag(gamertag);
      if (this.isDisposed) {
        return;
      }
      if (found == null) {
        this.config.store.batchUpdate({
          searching: false,
          result: null,
          matches: [],
          selectedMatchIds: [],
          searchError: "No matching gamertag found.",
        });
        return;
      }
      this.config.store.batchUpdate({ searching: false, result: found, loadingMatches: true });
      this.runLoadInitialMatches(found.xuid);
    } catch (err: unknown) {
      if (this.isDisposed) {
        return;
      }
      this.config.store.batchUpdate({
        searching: false,
        loadingMatches: false,
        searchError: err instanceof Error ? err.message : "Failed to search gamertag.",
      });
    }
  }

  private runLoadInitialMatches(xuid: string): void {
    void this.doLoadInitialMatches(xuid);
  }

  private async doLoadInitialMatches(xuid: string): Promise<void> {
    try {
      const firstResponse = await this.config.individualTrackerService.getMatchHistory(xuid, 0, MATCH_PAGE_SIZE);
      if (this.isDisposed) {
        return;
      }
      const nextSeriesGroups = alignSeriesGroupsToGroupings(firstResponse.suggestedGroupings, []);
      this.config.store.batchUpdate({
        matches: firstResponse.matches,
        activeGroupings: firstResponse.suggestedGroupings,
        seriesGroups: nextSeriesGroups,
        hasMore: firstResponse.matches.length >= MATCH_PAGE_SIZE,
        selectedMatchIds: [],
        loadingMatches: false,
      });
    } catch (err: unknown) {
      if (this.isDisposed) {
        return;
      }
      this.config.store.batchUpdate({
        loadingMatches: false,
        searchError: err instanceof Error ? err.message : "Failed to load match history.",
      });
    }
  }

  private async doLoadMore(xuid: string, offset: number): Promise<void> {
    try {
      const nextResponse = await this.config.individualTrackerService.getMatchHistory(xuid, offset, MATCH_PAGE_SIZE);
      if (this.isDisposed) {
        return;
      }
      const currentMatches = this.config.store.getSnapshot().matches;
      this.config.store.batchUpdate({
        matches: [...currentMatches, ...nextResponse.matches],
        hasMore: nextResponse.matches.length >= MATCH_PAGE_SIZE,
        loadingMatches: false,
      });
    } catch {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setLoadingMatches(false);
    }
  }

  private runStartTracker(gamertag: string): void {
    void this.doStartTracker(gamertag);
  }

  private async doStartTracker(gamertag: string): Promise<void> {
    try {
      await this.config.individualTrackerService.startTracker({ gamertag });
      if (this.isDisposed) {
        return;
      }
      this.config.store.setBusy(false);
      this.config.onTrackerStarted();
    } catch (err: unknown) {
      if (this.isDisposed) {
        return;
      }
      this.config.store.batchUpdate({
        busy: false,
        searchError: err instanceof Error ? err.message : "Failed to start tracker.",
      });
    }
  }
}
