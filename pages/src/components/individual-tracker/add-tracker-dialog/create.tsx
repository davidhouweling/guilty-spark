import React, { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import { AddTrackerDialogPresenter } from "./add-tracker-dialog-presenter";
import { AddTrackerDialogStore } from "./add-tracker-dialog-store";
import { AddTrackerDialog } from "./add-tracker-dialog";

export interface CreateAddTrackerDialogSectionConfig {
  readonly individualTrackerService: IndividualTrackerService;
}

export interface AddTrackerDialogSectionProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onTrackerStarted: () => void;
}

interface AddTrackerDialogSectionInternalProps extends AddTrackerDialogSectionProps {
  readonly config: CreateAddTrackerDialogSectionConfig;
}

function AddTrackerDialogSectionInternal({
  config,
  isOpen,
  onClose,
  onTrackerStarted,
}: AddTrackerDialogSectionInternalProps): React.ReactElement {
  const onTrackerStartedRef = React.useRef(onTrackerStarted);
  onTrackerStartedRef.current = onTrackerStarted;

  const { individualTrackerService } = config;
  const store = useMemo(() => new AddTrackerDialogStore(), []);
  const presenter = useMemo(
    () =>
      new AddTrackerDialogPresenter({
        store,
        individualTrackerService,
        onTrackerStarted: (): void => {
          onTrackerStartedRef.current();
        },
      }),
    [store, individualTrackerService],
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
    return presenter.loadMore();
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

export function createAddTrackerDialogSection(
  config: CreateAddTrackerDialogSectionConfig,
): (props: AddTrackerDialogSectionProps) => React.ReactElement {
  const Component = (props: AddTrackerDialogSectionProps): React.ReactElement => (
    <AddTrackerDialogSectionInternal {...props} config={config} />
  );

  return Component;
}
