import React, { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import type { IndividualTrackerSeriesGroup } from "../series-group-metadata";
import { MatchSelectionDialogPresenter } from "./match-selection-dialog-presenter";
import { MatchSelectionDialogStore } from "./match-selection-dialog-store";
import { MatchSelectionDialog } from "./match-selection-dialog";

export interface CreateMatchSelectionDialogSectionConfig {
  readonly individualTrackerService: IndividualTrackerService;
}

export interface MatchSelectionDialogSectionProps {
  readonly isOpen: boolean;
  readonly trackerId: string;
  readonly trackerLabel: string;
  readonly xuid: string;
  readonly initialSelectedMatchIds: readonly string[];
  readonly initialGroupings: readonly (readonly string[])[];
  readonly initialSeriesGroups: readonly IndividualTrackerSeriesGroup[];
  readonly searchStartTime?: string;
  readonly hasActiveSeriesWarning?: boolean;
  readonly onClose: () => void;
  readonly onSynced: () => void;
}

interface MatchSelectionDialogSectionInternalProps extends MatchSelectionDialogSectionProps {
  readonly config: CreateMatchSelectionDialogSectionConfig;
}

function MatchSelectionDialogSectionInternal({
  config,
  isOpen,
  trackerId,
  trackerLabel,
  xuid,
  initialSelectedMatchIds,
  initialGroupings,
  initialSeriesGroups,
  searchStartTime,
  hasActiveSeriesWarning,
  onClose,
  onSynced,
}: MatchSelectionDialogSectionInternalProps): React.ReactElement | null {
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const { individualTrackerService } = config;

  const store = useMemo(() => new MatchSelectionDialogStore(), []);

  const presenter = useMemo(
    () =>
      new MatchSelectionDialogPresenter({
        store,
        service: individualTrackerService,
        trackerId,
        xuid,
        initialSelectedMatchIds,
        initialGroupings,
        initialSeriesGroups,
        searchStartTime,
        hasActiveSeriesWarning,
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
      hasActiveSeriesWarning,
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

  const model = useMemo(() => MatchSelectionDialogPresenter.present(snapshot), [snapshot]);

  const handleSyncAndClose = (): void => {
    presenter.syncAndClose();
  };

  return (
    <MatchSelectionDialog
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

export function createMatchSelectionDialogSection(
  config: CreateMatchSelectionDialogSectionConfig,
): (props: MatchSelectionDialogSectionProps) => React.ReactElement | null {
  const Component = (props: MatchSelectionDialogSectionProps): React.ReactElement | null => (
    <MatchSelectionDialogSectionInternal {...props} config={config} />
  );

  return Component;
}
