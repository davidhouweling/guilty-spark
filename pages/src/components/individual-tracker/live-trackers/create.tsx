import React, { useSyncExternalStore } from "react";
import type { Services } from "../../../services/types";
import { AddTrackerDialog } from "../add-tracker-dialog/add-tracker-dialog";
import { GameSelectionDialog } from "../game-selection-dialog/game-selection-dialog";
import { LiveTrackersPresenter } from "./live-trackers-presenter";
import { LiveTrackersStore } from "./live-trackers-store";
import type { LiveTrackersController, LiveTrackersSectionController } from "./types";
import { LiveTrackersSectionView } from "./live-trackers";

interface LiveTrackersSectionInternalProps {
  readonly controller: LiveTrackersSectionController;
}

function LiveTrackersSectionInternal({ controller }: LiveTrackersSectionInternalProps): React.ReactElement {
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
          <AddTrackerDialog
            isOpen={snapshot.isAddDialogOpen}
            busy={snapshot.busy}
            onClose={(): void => {
              controller.closeAddDialog();
            }}
            onSearchGamertag={async (query) => controller.searchGamertag(query)}
            onLoadMatches={async (xuid, start, count) => controller.loadMatches(xuid, start, count)}
            onStartTracker={async (payload) => controller.addTracker(payload)}
          />

          <GameSelectionDialog
            isOpen={snapshot.gameSelectionDialogState != null}
            busy={snapshot.busy}
            trackerLabel={snapshot.gameSelectionDialogState?.trackerLabel ?? ""}
            trackerId={snapshot.gameSelectionDialogState?.trackerId ?? ""}
            xuid={snapshot.gameSelectionDialogState?.xuid ?? ""}
            initialSelectedMatchIds={snapshot.gameSelectionDialogState?.initialSelectedMatchIds ?? []}
            initialGroupings={snapshot.gameSelectionDialogState?.initialGroupings ?? []}
            onClose={(): void => {
              controller.closeGameSelectionDialog();
            }}
            onLoadEnrichedMatches={async (xuid, start, count) => controller.loadMatches(xuid, start, count)}
            onSync={async (payload) => controller.syncGameSelection(payload)}
          />
        </>
      }
    />
  );
}

interface CreateLiveTrackersSectionConfig {
  readonly services: Services;
  readonly assignLocation?: (url: string) => void;
  readonly confirmDelete?: (message: string) => boolean;
}

interface CreateLiveTrackersSectionResult {
  readonly controller: LiveTrackersController;
  readonly Component: () => React.ReactElement;
}

export function createLiveTrackersSection(config: CreateLiveTrackersSectionConfig): CreateLiveTrackersSectionResult {
  const store = new LiveTrackersStore();

  const controller = new LiveTrackersPresenter({
    services: config.services,
    store,
    assignLocation: config.assignLocation,
    confirmDelete: config.confirmDelete,
  });

  const Component = (): React.ReactElement => <LiveTrackersSectionInternal controller={controller} />;

  return {
    controller,
    Component,
  };
}
