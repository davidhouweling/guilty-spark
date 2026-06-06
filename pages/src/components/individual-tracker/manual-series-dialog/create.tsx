import React, { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import { ManualSeriesDialogPresenter } from "./manual-series-dialog-presenter";
import { ManualSeriesDialogStore } from "./manual-series-dialog-store";
import { ManualSeriesDialog } from "./manual-series-dialog";

interface ManualSeriesDialogSectionProps {
  readonly trackerId: string;
  readonly trackerLabel: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSeriesStarted: () => void;
  readonly individualTrackerService: IndividualTrackerService;
}

export function ManualSeriesDialogSection({
  trackerId,
  trackerLabel,
  isOpen,
  onClose,
  onSeriesStarted,
  individualTrackerService,
}: ManualSeriesDialogSectionProps): React.ReactElement | null {
  const onSeriesStartedRef = useRef(onSeriesStarted);
  onSeriesStartedRef.current = onSeriesStarted;

  const store = useMemo(() => new ManualSeriesDialogStore(), []);
  const presenter = useMemo(
    () =>
      new ManualSeriesDialogPresenter({
        trackerId,
        store,
        individualTrackerService,
        onSeriesStarted: (): void => {
          onSeriesStartedRef.current();
        },
      }),
    [trackerId, store, individualTrackerService],
  );

  useEffect(() => {
    if (!isOpen) {
      store.reset();
    }
  }, [isOpen, store]);

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

  return (
    <ManualSeriesDialog
      isOpen={isOpen}
      trackerLabel={trackerLabel}
      snapshot={snapshot}
      onClose={onClose}
      onTitleChange={(value): void => {
        presenter.setTitleOverride(value);
      }}
      onSubtitleChange={(value): void => {
        presenter.setSubtitleOverride(value);
      }}
      onTeamNameChange={(teamIndex, value): void => {
        presenter.setTeamName(teamIndex, value);
      }}
      onTeamMemberChange={(teamIndex, memberIndex, value): void => {
        presenter.setTeamMember(teamIndex, memberIndex, value);
      }}
      onAddTeamMember={(teamIndex): void => {
        presenter.addTeamMember(teamIndex);
      }}
      onRemoveTeamMember={(teamIndex, memberIndex): void => {
        presenter.removeTeamMember(teamIndex, memberIndex);
      }}
      onDiscoverBackfill={(): void => {
        presenter.discoverBackfillMatches();
      }}
      onBackfillMatchToggle={(matchId): void => {
        presenter.toggleBackfillMatch(matchId);
      }}
      onStartSeries={(): void => {
        presenter.startSeries();
      }}
    />
  );
}
