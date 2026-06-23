import React, { useEffect, useSyncExternalStore } from "react";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import { AddTrackerDialogSection } from "../../individual-tracker/add-tracker-dialog/create";
import { GameSelectionDialogSection } from "../../individual-tracker/game-selection-dialog/create";
import { ManualSeriesDialogSection } from "../../individual-tracker/manual-series-dialog/create";
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
            individualTrackerService={individualTrackerService}
          />
          {snapshot.gameSelectionDialogState != null && (
            <GameSelectionDialogSection
              isOpen={true}
              trackerId={snapshot.gameSelectionDialogState.trackerId}
              trackerLabel={snapshot.gameSelectionDialogState.trackerLabel}
              xuid={snapshot.gameSelectionDialogState.xuid}
              initialSelectedMatchIds={snapshot.gameSelectionDialogState.initialSelectedMatchIds}
              initialGroupings={snapshot.gameSelectionDialogState.initialGroupings}
              initialSeriesGroups={snapshot.gameSelectionDialogState.initialSeriesGroups}
              searchStartTime={snapshot.gameSelectionDialogState.searchStartTime}
              hasActiveSeriesWarning={snapshot.gameSelectionDialogState.hasActiveSeriesWarning}
              onClose={(): void => {
                controller.closeGameSelectionDialog();
              }}
              onSynced={(): void => {
                controller.closeGameSelectionDialog();
                void controller.refresh();
              }}
              individualTrackerService={individualTrackerService}
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
              individualTrackerService={individualTrackerService}
              viewService={individualTrackerViewService}
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
