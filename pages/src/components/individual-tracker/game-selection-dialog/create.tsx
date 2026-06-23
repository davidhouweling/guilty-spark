import React, { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import type { IndividualTrackerSeriesGroup } from "../series-group-metadata";
import { GameSelectionDialogPresenter } from "./game-selection-dialog-presenter";
import { GameSelectionDialogStore } from "./game-selection-dialog-store";
import { GameSelectionDialog } from "./game-selection-dialog";

export interface GameSelectionDialogSectionProps {
  readonly isOpen: boolean;
  readonly trackerId: string;
  readonly trackerLabel: string;
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
  readonly onClose: () => void;
  readonly onSynced: () => void;
  readonly individualTrackerService: IndividualTrackerService;
}

export function GameSelectionDialogSection({
  isOpen,
  trackerId,
  trackerLabel,
  xuid,
  initialSelectedMatchIds,
  initialGroupings,
  initialSeriesGroups,
  searchStartTime,
  activeSeriesContext,
  onClose,
  onSynced,
  individualTrackerService,
}: GameSelectionDialogSectionProps): React.ReactElement | null {
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const store = useMemo(() => new GameSelectionDialogStore(), []);

  const presenter = useMemo(
    () =>
      new GameSelectionDialogPresenter({
        store,
        service: individualTrackerService,
        trackerId,
        xuid,
        initialSelectedMatchIds,
        initialGroupings,
        initialSeriesGroups,
        searchStartTime,
        activeSeriesContext,
        onSynced: (): void => {
          onSyncedRef.current();
        },
      }),
    [
      store,
      individualTrackerService,
      trackerId,
      xuid,
      initialSelectedMatchIds,
      initialGroupings,
      initialSeriesGroups,
      searchStartTime,
      activeSeriesContext,
    ],
  );

  useEffect(() => {
    if (isOpen) {
      presenter.loadMatches();
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

  const model = useMemo(() => GameSelectionDialogPresenter.present(snapshot), [snapshot]);

  const handleSyncAndClose = (): void => {
    presenter.syncAndClose();
  };

  return (
    <GameSelectionDialog
      isOpen={isOpen}
      trackerLabel={trackerLabel}
      selectedCount={model.selectedCount}
      isSyncing={snapshot.isSyncing}
      errorMessage={snapshot.errorMessage}
      visibleMatches={model.visibleMatches}
      groupings={snapshot.groupings}
      seriesGroups={snapshot.seriesGroups}
      selectedMatchIds={snapshot.selectedMatchIds}
      hasMore={snapshot.hasMore}
      hideShortGames={snapshot.hideShortGames}
      hasActiveSeriesWarning={snapshot.hasActiveSeriesWarning}
      onClose={onClose}
      onSyncAndClose={handleSyncAndClose}
      onMatchToggle={(matchId): void => {
        presenter.toggleMatch(matchId);
      }}
      onBreakFromGroup={(matchId): void => {
        presenter.breakGroup(matchId);
      }}
      onAddToAboveGroup={(matchId): void => {
        presenter.addToGroup(matchId, "above");
      }}
      onAddToBelowGroup={(matchId): void => {
        presenter.addToGroup(matchId, "below");
      }}
      onSeriesGroupTitleChange={(groupIndex, value): void => {
        presenter.updateSeriesGroupTitle(groupIndex, value);
      }}
      onSeriesGroupSubtitleChange={(groupIndex, value): void => {
        presenter.updateSeriesGroupSubtitle(groupIndex, value);
      }}
      onHideShortGamesChange={(hide): void => {
        presenter.setHideShortGames(hide);
      }}
      onLoadMore={async (): Promise<void> => {
        return presenter.loadMore();
      }}
    />
  );
}
