import React, { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import { AddTrackerDialogPresenter } from "./add-tracker-dialog-presenter";
import { AddTrackerDialogStore } from "./add-tracker-dialog-store";
import { AddTrackerDialog } from "./add-tracker-dialog";

interface AddTrackerDialogSectionProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onTrackerStarted: () => void;
  readonly individualTrackerService: IndividualTrackerService;
}

export function AddTrackerDialogSection({
  isOpen,
  onClose,
  onTrackerStarted,
  individualTrackerService,
}: AddTrackerDialogSectionProps): React.ReactElement {
  const store = useMemo(() => new AddTrackerDialogStore(), []);
  const presenter = useMemo(
    () => new AddTrackerDialogPresenter({ store, individualTrackerService, onTrackerStarted }),
    [store, individualTrackerService, onTrackerStarted],
  );

  useEffect(() => {
    if (!isOpen) {
      presenter.reset();
    }
  }, [presenter, isOpen]);

  useEffect(() => {
    return (): void => {
      presenter.dispose();
    };
  }, [presenter]);

  const snapshot = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );

  const model = useMemo(() => AddTrackerDialogPresenter.present(snapshot), [snapshot]);

  const handleLoadMore = useCallback(async (): Promise<void> => {
    presenter.loadMore();
    return Promise.resolve();
  }, [presenter]);

  return (
    <AddTrackerDialog
      open={isOpen}
      busy={model.busy}
      query={model.query}
      searching={model.searching}
      searchError={model.searchError}
      result={model.result}
      visibleMatches={model.visibleMatches}
      activeGroupings={model.activeGroupings}
      loadingMatches={model.loadingMatches}
      hasMore={model.hasMore}
      selectedMatchIds={model.selectedMatchIds}
      seriesGroups={model.seriesGroups}
      hideShortGames={model.hideShortGames}
      canStart={model.canStart}
      onClose={onClose}
      onQueryChange={(value): void => {
        presenter.setQuery(value);
      }}
      onSearch={(): void => {
        presenter.search();
      }}
      onMatchToggle={(matchId): void => {
        presenter.toggleMatch(matchId);
      }}
      onLoadMore={handleLoadMore}
      onAddToAboveGroup={(matchId): void => {
        presenter.addToGroup(matchId, "above");
      }}
      onAddToBelowGroup={(matchId): void => {
        presenter.addToGroup(matchId, "below");
      }}
      onBreakFromGroup={(matchId): void => {
        presenter.breakGroup(matchId);
      }}
      onHideShortGamesChange={(value): void => {
        presenter.setHideShortGames(value);
      }}
      onSeriesGroupTitleChange={(groupIndex, value): void => {
        presenter.setSeriesGroupTitle(groupIndex, value);
      }}
      onSeriesGroupSubtitleChange={(groupIndex, value): void => {
        presenter.setSeriesGroupSubtitle(groupIndex, value);
      }}
      onStartTracker={(): void => {
        presenter.startTracker();
      }}
    />
  );
}
