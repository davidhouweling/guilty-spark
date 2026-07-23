import React, { useEffect, useSyncExternalStore } from "react";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import { createAddTrackerDialogSection } from "../../individual-tracker/add-tracker-dialog/create";
import { createMatchSelectionDialogSection } from "../../individual-tracker/match-selection-dialog/create";
import { createManualSeriesDialogSection } from "../../individual-tracker/manual-series-dialog/create";
import { LiveTrackersPresenter } from "./live-trackers-presenter";
import { LiveTrackersStore } from "./live-trackers-store";
import type { LiveTrackersController, LiveTrackersSectionController } from "./types";
import { LiveTrackersSectionView } from "./live-trackers";

interface LiveTrackersSectionInternalProps {
  readonly controller: LiveTrackersSectionController;
  readonly individualTrackerService: IndividualTrackerService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
}

function LiveTrackersSectionInternal({
  controller,
  individualTrackerService,
  individualTrackerViewService,
}: LiveTrackersSectionInternalProps): React.ReactElement {
  const AddTrackerDialogSection = React.useMemo(
    () =>
      createAddTrackerDialogSection({
        individualTrackerService,
      }),
    [individualTrackerService],
  );
  const MatchSelectionDialogSection = React.useMemo(
    () =>
      createMatchSelectionDialogSection({
        individualTrackerService,
      }),
    [individualTrackerService],
  );
  const ManualSeriesDialogSection = React.useMemo(
    () =>
      createManualSeriesDialogSection({
        individualTrackerService,
        individualTrackerViewService,
      }),
    [individualTrackerService, individualTrackerViewService],
  );

  useEffect(() => {
    controller.start();
    return (): void => {
      controller.dispose();
    };
  }, [controller]);

  const snapshot = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.getSnapshot(),
    () => controller.getSnapshot(),
  );

  return (
    <LiveTrackersSectionView
      errorMessage={snapshot.errorMessage}
      trackerItems={controller.getTrackerItems()}
      getActions={(item) => controller.getActions(item)}
      onAddTracker={(): void => {
        controller.openAddDialog();
      }}
      dialogs={
        <>
          <AddTrackerDialogSection
            isOpen={snapshot.isAddDialogOpen}
            onClose={(): void => {
              controller.closeAddDialog();
            }}
            onTrackerStarted={(): void => {
              controller.closeAddDialog();
              void controller.refresh();
            }}
          />
          {snapshot.matchSelectionDialogState != null && (
            <MatchSelectionDialogSection
              isOpen={true}
              trackerId={snapshot.matchSelectionDialogState.trackerId}
              trackerLabel={snapshot.matchSelectionDialogState.trackerLabel}
              xuid={snapshot.matchSelectionDialogState.xuid}
              initialSelectedMatchIds={snapshot.matchSelectionDialogState.initialSelectedMatchIds}
              initialGroupings={snapshot.matchSelectionDialogState.initialGroupings}
              initialSeriesGroups={snapshot.matchSelectionDialogState.initialSeriesGroups}
              searchStartTime={snapshot.matchSelectionDialogState.searchStartTime}
              hasActiveSeriesWarning={snapshot.matchSelectionDialogState.hasActiveSeriesWarning}
              onClose={(): void => {
                controller.closeMatchSelectionDialog();
              }}
              onSynced={(): void => {
                controller.closeMatchSelectionDialog();
                void controller.refresh();
              }}
            />
          )}
          {snapshot.manualSeriesDialogState != null && (
            <ManualSeriesDialogSection
              trackerId={snapshot.manualSeriesDialogState.trackerId}
              trackerLabel={snapshot.manualSeriesDialogState.trackerLabel}
              isOpen={true}
              onClose={(): void => {
                controller.closeManualSeriesDialog();
              }}
              onSeriesStarted={(): void => {
                controller.closeManualSeriesDialog();
                void controller.refresh();
              }}
              onSeriesEdited={(): void => {
                controller.closeManualSeriesDialog();
                void controller.refresh();
              }}
              initialData={snapshot.manualSeriesDialogState.initialData}
            />
          )}
        </>
      }
    />
  );
}

interface CreateLiveTrackersSectionConfig {
  readonly individualTrackerService: IndividualTrackerService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly navigateTo?: ((url: string) => void) | undefined;
  readonly confirmDelete?: ((message: string) => boolean) | undefined;
}

interface CreateLiveTrackersSectionResult {
  readonly controller: LiveTrackersController;
  readonly Component: () => React.ReactElement;
}

export function createLiveTrackersSection(config: CreateLiveTrackersSectionConfig): CreateLiveTrackersSectionResult {
  const store = new LiveTrackersStore();

  const presenter = new LiveTrackersPresenter({
    individualTrackerService: config.individualTrackerService,
    store,
    navigateTo: config.navigateTo,
    confirmDelete: config.confirmDelete,
  });

  const Component = (): React.ReactElement => (
    <LiveTrackersSectionInternal
      controller={presenter}
      individualTrackerService={config.individualTrackerService}
      individualTrackerViewService={config.individualTrackerViewService}
    />
  );

  return { controller: presenter, Component };
}
