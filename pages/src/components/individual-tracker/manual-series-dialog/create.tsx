import React, { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import { ManualSeriesDialogPresenter } from "./manual-series-dialog-presenter";
import { ManualSeriesDialogStore } from "./manual-series-dialog-store";
import type { SeriesInitialData } from "./manual-series-dialog-store";
import { ManualSeriesDialog } from "./manual-series-dialog";

interface ManualSeriesDialogSectionProps {
  readonly trackerId: string;
  readonly trackerLabel: string;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSeriesStarted: () => void;
  readonly individualTrackerService: IndividualTrackerService;
  readonly viewService: IndividualTrackerViewService;
  readonly initialData?: SeriesInitialData;
  readonly onSeriesEdited?: () => void;
}

export function ManualSeriesDialogSection({
  trackerId,
  trackerLabel,
  isOpen,
  onClose,
  onSeriesStarted,
  individualTrackerService,
  viewService,
  initialData,
  onSeriesEdited,
}: ManualSeriesDialogSectionProps): React.ReactElement | null {
  const onSeriesStartedRef = useRef(onSeriesStarted);
  onSeriesStartedRef.current = onSeriesStarted;
  const onSeriesEditedRef = useRef(onSeriesEdited);
  onSeriesEditedRef.current = onSeriesEdited;

  const initialDataRef = useRef(initialData);
  initialDataRef.current = initialData;
  const store = useMemo(() => new ManualSeriesDialogStore(initialDataRef.current), []);
  const presenter = useMemo(
    () =>
      new ManualSeriesDialogPresenter({
        trackerId,
        store,
        individualTrackerService,
        viewService,
        onSeriesStarted: (): void => {
          onSeriesStartedRef.current();
        },
        onSeriesEdited: (): void => {
          onSeriesEditedRef.current?.();
        },
      }),
    [trackerId, store, individualTrackerService, viewService],
  );

  useEffect(() => {
    store.reset(initialData);
  }, [isOpen, store, initialData]);

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

  const handleSubmit = (): void => {
    if (snapshot.mode === "edit") {
      presenter.editSeries();
    } else {
      presenter.startSeries();
    }
  };

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
      onStartSeries={handleSubmit}
    />
  );
}
