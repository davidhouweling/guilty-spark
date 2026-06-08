import React, { useEffect, useSyncExternalStore } from "react";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import { LiveTrackersPresenter } from "./live-trackers-presenter";
import { LiveTrackersStore } from "./live-trackers-store";
import type { LiveTrackersController, LiveTrackersSectionController } from "./types";
import { LiveTrackersSectionView } from "./live-trackers";

interface LiveTrackersSectionInternalProps {
  readonly controller: LiveTrackersSectionController;
}

function LiveTrackersSectionInternal({ controller }: LiveTrackersSectionInternalProps): React.ReactElement {
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
        return;
      }}
    />
  );
}

interface CreateLiveTrackersSectionConfig {
  readonly individualTrackerService: IndividualTrackerService;
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

  const Component = (): React.ReactElement => <LiveTrackersSectionInternal controller={presenter} />;

  return { controller: presenter, Component };
}
