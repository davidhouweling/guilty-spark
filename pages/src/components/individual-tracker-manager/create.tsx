import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import { ComponentLoader } from "../component-loader/component-loader";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import type { IndividualTrackerService } from "../../services/individual-tracker/types";
import { IndividualTrackerManagerPresenter } from "./individual-tracker-manager-presenter";
import { IndividualTrackerManagerStore } from "./individual-tracker-manager-store";
import { IndividualTrackerManagerProvider } from "./individual-tracker-manager-context";
import { IndividualTrackerManagerView } from "./individual-tracker-manager";
import type { TrackerRowAction } from "./manager-model";

interface IndividualTrackerManagerPageProps {
  readonly individualTrackerService: IndividualTrackerService;
}

export function IndividualTrackerManagerPage({
  individualTrackerService,
}: IndividualTrackerManagerPageProps): React.ReactElement {
  const store = useMemo(() => new IndividualTrackerManagerStore(), []);

  const presenter = useMemo(() => {
    return new IndividualTrackerManagerPresenter({ individualTrackerService, store });
  }, [individualTrackerService, store]);

  useEffect(() => {
    presenter.start();

    return (): void => {
      presenter.dispose();
    };
  }, [presenter]);

  const snapshot = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );

  const model = useMemo(() => IndividualTrackerManagerPresenter.present(snapshot), [snapshot]);

  const actions = useMemo(
    () => ({
      onOpenAddDialog: (): void => {
        presenter.openAddDialog();
      },
      onCloseAddDialog: (): void => {
        presenter.closeAddDialog();
      },
      onGamertagInputChange: (value: string): void => {
        presenter.setGamertagInput(value);
      },
      onSearchStartTimeChange: (value: string): void => {
        presenter.setSearchStartTime(value);
      },
      onIdleTimeoutHoursChange: (value: string): void => {
        presenter.setIdleTimeoutHours(value);
      },
      onAddTracker: (): void => {
        presenter.addTracker();
      },
      onRowAction: (trackerId: string, action: TrackerRowAction): void => {
        presenter.runRowAction(trackerId, action);
      },
    }),
    [presenter],
  );

  return (
    <ComponentLoader
      status={snapshot.status}
      loading={<LoadingState text="Loading your trackers..." />}
      error={
        <ErrorState
          message={snapshot.errorMessage ?? "Failed to load trackers"}
          onRetry={() => {
            presenter.start();
          }}
        />
      }
      loaded={
        <IndividualTrackerManagerProvider model={model} actions={actions}>
          <IndividualTrackerManagerView />
        </IndividualTrackerManagerProvider>
      }
    />
  );
}
