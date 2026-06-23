import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import { analyzeMatchGroupings } from "@guilty-spark/shared/halo/match-enrichment";
import type { IndividualTrackerSeriesGroup } from "../series-group-metadata";
import { alignSeriesGroupsToGroupings } from "../series-group-metadata";
import { applyAddToAdjacentGroup, applyBreakFromGroup } from "../grouping-utils";
import { shouldHideShortDurationMatch } from "../match-duration-filter";
import type { GameSelectionDialogSnapshot, GameSelectionDialogStore } from "./game-selection-dialog-store";
import type { TrackerMatchHistoryEntry } from "../../../services/individual-tracker/types";

interface Config {
  readonly store: GameSelectionDialogStore;
  readonly service: IndividualTrackerService;
  readonly trackerId: string;
  readonly xuid: string;
  readonly initialSelectedMatchIds: readonly string[];
  readonly initialGroupings: readonly (readonly string[])[];
  readonly initialSeriesGroups: readonly IndividualTrackerSeriesGroup[];
  readonly searchStartTime?: string;
  readonly activeSeriesContext?: {
    readonly title: string;
    readonly subtitle: string | null;
    readonly teams: readonly unknown[];
  };
  readonly onSynced: () => void;
}

export class GameSelectionDialogPresenter {
  private readonly config: Config;
  private isDisposed = false;

  public constructor(config: Config) {
    this.config = config;
  }

  public dispose(): void {
    this.isDisposed = true;
  }

  public loadMatches(): void {
    if (this.isDisposed) {
      return;
    }

    const { store, initialSelectedMatchIds, initialGroupings, initialSeriesGroups } = this.config;

    store.batchUpdate({
      matches: null,
      selectedMatchIds: new Set(initialSelectedMatchIds),
      groupings: initialGroupings.map((group) => [...group]),
      seriesGroups: initialSeriesGroups.map((group) => ({ ...group, matchIds: [...group.matchIds] })),
      hasMore: false,
      hideShortGames: true,
      isSyncing: false,
      hasActiveSeriesWarning: false,
      errorMessage: null,
    });

    void this.loadMatchesAsync();
  }

  private async loadMatchesAsync(): Promise<void> {
    const { store, service, xuid, initialSelectedMatchIds, searchStartTime, activeSeriesContext } = this.config;
    try {
      const allLoadedMatches: TrackerMatchHistoryEntry[] = [];
      const maxPages = 4;
      const pageSize = 25;
      const targetMatchIds = new Set(initialSelectedMatchIds);
      const searchStartTimeMs = searchStartTime != null ? new Date(searchStartTime).getTime() : 0;

      // Load pages until all initial matches are found, we've covered searchStartTime, or we reach max pages
      for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
        const offset = pageIndex * pageSize;
        const response = await service.getMatchHistory(xuid, offset, pageSize);

        if (this.isDisposed) {
          return;
        }

        allLoadedMatches.push(...response.matches);

        // Check if all target matches are now loaded
        const loadedMatchIds = new Set(allLoadedMatches.map((match) => match.matchId));
        const allFound = Array.from(targetMatchIds).every((id) => loadedMatchIds.has(id));

        // Check if we've covered the searchStartTime boundary (if provided)
        const reachedSearchBoundary =
          searchStartTimeMs === 0 ||
          response.matches.length === 0 ||
          response.matches.some(
            (match) => new Date(match.startTime).getTime() < searchStartTimeMs,
          );

        // Stop early if all matches found AND we've reached the search boundary, or if we got fewer than pageSize (end of history)
        if ((allFound && reachedSearchBoundary) || response.matches.length < pageSize) {
          const snapshot = store.getSnapshot();
          const groupings = snapshot.groupings.length > 0 ? snapshot.groupings : [...response.suggestedGroupings];
          store.batchUpdate({
            matches: allLoadedMatches,
            groupings,
            seriesGroups: alignSeriesGroupsToGroupings(groupings, Array.from(snapshot.seriesGroups)),
            hasMore: response.matches.length >= pageSize,
            hasActiveSeriesWarning: activeSeriesContext !== undefined,
          });
          return;
        }
      }

      // Reached max pages without finding all (rare edge case, but acceptable per requirements)
      const snapshot = store.getSnapshot();
      const groupings = snapshot.groupings.length > 0 ? snapshot.groupings : [];
      store.batchUpdate({
        matches: allLoadedMatches,
        groupings,
        seriesGroups: alignSeriesGroupsToGroupings(groupings, Array.from(snapshot.seriesGroups)),
        hasMore: true,
        hasActiveSeriesWarning: activeSeriesContext !== undefined,
      });
    } catch (err: unknown) {
      if (this.isDisposed) {
        return;
      }
      store.batchUpdate({
        errorMessage: err instanceof Error ? err.message : "Failed to load matches.",
      });
    }
  }

  public async loadMore(): Promise<void> {
    if (this.isDisposed) {
      return Promise.resolve();
    }

    const snapshot = this.config.store.getSnapshot();

    if (snapshot.matches == null) {
      return Promise.resolve();
    }

    return this.loadMoreAsync(snapshot.matches.length);
  }

  private async loadMoreAsync(start: number): Promise<void> {
    const { store, service, xuid } = this.config;
    try {
      const response = await service.getMatchHistory(xuid, start, 25);
      if (this.isDisposed) {
        return;
      }
      const current = store.getSnapshot();
      const allMatches = current.matches != null ? [...current.matches, ...response.matches] : response.matches;
      const nextGroupings = this.mergeSuggestedGroupings(current.groupings, allMatches, start);
      const nextSeriesGroups = alignSeriesGroupsToGroupings(nextGroupings, Array.from(current.seriesGroups));
      store.batchUpdate({
        matches: allMatches,
        groupings: nextGroupings,
        seriesGroups: nextSeriesGroups,
        hasMore: response.matches.length >= 25,
      });
    } catch {
      /* keep existing data visible */
    }
  }

  public toggleMatch(matchId: string): void {
    if (this.isDisposed) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    const next = new Set(snapshot.selectedMatchIds);
    if (next.has(matchId)) {
      next.delete(matchId);
    } else {
      next.add(matchId);
    }
    this.config.store.setSelectedMatchIds(next);
  }

  public breakGroup(matchId: string): void {
    if (this.isDisposed) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    const entries = snapshot.matches ?? [];
    const nextGroupings = applyBreakFromGroup(snapshot.groupings, entries, matchId);
    this.applyGroupingsUpdate(nextGroupings);
  }

  public addToGroup(matchId: string, direction: "above" | "below"): void {
    if (this.isDisposed) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    const entries = snapshot.matches ?? [];
    const nextGroupings = applyAddToAdjacentGroup(snapshot.groupings, entries, matchId, direction);
    this.applyGroupingsUpdate(nextGroupings);
  }

  public setHideShortGames(hide: boolean): void {
    if (this.isDisposed) {
      return;
    }
    this.config.store.setHideShortGames(hide);
  }

  public updateSeriesGroupTitle(groupIndex: number, value: string | null): void {
    if (this.isDisposed) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    const nextSeriesGroups = snapshot.seriesGroups.map((group, index) =>
      index === groupIndex ? { ...group, titleOverride: value } : group,
    );
    this.config.store.setSeriesGroups(nextSeriesGroups);
  }

  public updateSeriesGroupSubtitle(groupIndex: number, value: string | null): void {
    if (this.isDisposed) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    const nextSeriesGroups = snapshot.seriesGroups.map((group, index) =>
      index === groupIndex ? { ...group, subtitleOverride: value } : group,
    );
    this.config.store.setSeriesGroups(nextSeriesGroups);
  }

  public syncAndClose(): void {
    if (this.isDisposed) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();

    if (snapshot.isSyncing) {
      return;
    }

    this.config.store.batchUpdate({ isSyncing: true, errorMessage: null });
    void this.syncAndCloseAsync(snapshot);
  }

  private async syncAndCloseAsync(snapshot: GameSelectionDialogSnapshot): Promise<void> {
    const { store, service, trackerId, onSynced } = this.config;
    try {
      await service.syncMatchesToTracker({
        trackerId,
        selectedMatchIds: Array.from(snapshot.selectedMatchIds),
        matchGroupings: snapshot.groupings,
        matches: snapshot.matches ?? [],
      });
      if (this.isDisposed) {
        return;
      }
      onSynced();
    } catch (err: unknown) {
      if (this.isDisposed) {
        return;
      }
      store.batchUpdate({
        isSyncing: false,
        errorMessage: err instanceof Error ? err.message : "Failed to sync game selection.",
      });
    }
  }

  public static present(snapshot: ReturnType<GameSelectionDialogStore["getSnapshot"]>): {
    readonly visibleMatches: ReturnType<GameSelectionDialogStore["getSnapshot"]>["matches"];
    readonly selectedCount: number;
  } {
    const visibleMatches =
      snapshot.matches == null
        ? null
        : snapshot.hideShortGames
          ? snapshot.matches.filter((entry) => !shouldHideShortDurationMatch(entry))
          : snapshot.matches;

    return {
      visibleMatches,
      selectedCount: snapshot.selectedMatchIds.size,
    };
  }

  private applyGroupingsUpdate(nextGroupings: readonly (readonly string[])[]): void {
    const snapshot = this.config.store.getSnapshot();
    const nextSeriesGroups = alignSeriesGroupsToGroupings(nextGroupings, Array.from(snapshot.seriesGroups));
    this.config.store.batchUpdate({ groupings: nextGroupings, seriesGroups: nextSeriesGroups });
  }

  private mergeSuggestedGroupings(
    currentGroupings: readonly (readonly string[])[],
    allMatches: readonly TrackerMatchHistoryEntry[],
    previousMatchCount: number,
  ): readonly (readonly string[])[] {
    const pageSize = 25;
    const lookbackStart = Math.max(0, previousMatchCount - pageSize);
    const boundaryMatches = allMatches.slice(lookbackStart);
    const newMatchIds = new Set(allMatches.slice(previousMatchCount).map((match) => match.matchId));
    const suggestedGroupings = this.computeSuggestedGroupings(boundaryMatches).filter((group) =>
      group.some((matchId) => newMatchIds.has(matchId)),
    );
    const usedMatchIds = new Set(currentGroupings.flatMap((group) => group));
    const nextGroupings = currentGroupings.map((group) => [...group]);

    for (const suggestedGroup of suggestedGroupings) {
      if (suggestedGroup.some((matchId) => usedMatchIds.has(matchId))) {
        continue;
      }

      nextGroupings.push([...suggestedGroup]);
      for (const matchId of suggestedGroup) {
        usedMatchIds.add(matchId);
      }
    }

    return this.sortGroupingsByTimeline(nextGroupings, allMatches);
  }

  private computeSuggestedGroupings(allMatches: readonly TrackerMatchHistoryEntry[]): readonly (readonly string[])[] {
    return analyzeMatchGroupings(
      allMatches.map((match) => ({
        matchId: match.matchId,
        isMatchmaking: match.isMatchmaking,
        teamRosterSignature: this.getTeamRosterSignature(match),
      })),
    );
  }

  private getTeamRosterSignature(match: TrackerMatchHistoryEntry): string | null {
    if (match.isMatchmaking || match.teams.length === 0) {
      return null;
    }

    return match.teams
      .map((team, index) => `${index.toString()}:${[...team].sort().join(",")}`)
      .join("|");
  }

  private sortGroupingsByTimeline(
    groupings: readonly (readonly string[])[],
    allMatches: readonly TrackerMatchHistoryEntry[],
  ): readonly (readonly string[])[] {
    const matchIndex = new Map<string, number>();
    for (const [index, match] of allMatches.entries()) {
      matchIndex.set(match.matchId, index);
    }

    return [...groupings].sort((leftGroup, rightGroup) => {
      const leftIndex = Math.min(...leftGroup.map((matchId) => matchIndex.get(matchId) ?? Number.MAX_SAFE_INTEGER));
      const rightIndex = Math.min(...rightGroup.map((matchId) => matchIndex.get(matchId) ?? Number.MAX_SAFE_INTEGER));
      return leftIndex - rightIndex;
    });
  }
}
