import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import { ComponentLoader } from "../../component-loader/component-loader";
import { ErrorState } from "../../error-state/error-state";
import { LoadingState } from "../../loading-state/loading-state";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import { IndividualTrackerViewer } from "./individual-tracker-viewer";
import { IndividualTrackerViewerPresenter } from "./viewer-presenter";
import { IndividualTrackerViewerStore } from "./viewer-store";

interface IndividualTrackerViewerPageProps {
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly trackerId: string;
}

export function IndividualTrackerViewerPage({
  individualTrackerViewService,
  trackerId,
}: IndividualTrackerViewerPageProps): React.ReactElement {
  const store = useMemo(() => new IndividualTrackerViewerStore(), []);

  const presenter = useMemo(() => {
    return new IndividualTrackerViewerPresenter({ individualTrackerViewService, store, trackerId });
  }, [individualTrackerViewService, store, trackerId]);

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

  const model = useMemo(() => IndividualTrackerViewerPresenter.present(snapshot), [snapshot]);

  return (
    <ComponentLoader
      status={snapshot.status}
      loading={<LoadingState text="Loading tracker..." />}
      error={
        <ErrorState
          message={snapshot.errorMessage ?? "Failed to load tracker"}
          onRetry={() => {
            presenter.start();
          }}
        />
      }
      loaded={<IndividualTrackerViewer model={model} />}
    />
  );
}
