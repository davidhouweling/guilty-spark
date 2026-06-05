import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { ComponentLoader } from "../../component-loader/component-loader";
import { ErrorState } from "../../error-state/error-state";
import { LoadingState } from "../../loading-state/loading-state";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import { IndividualTrackerViewer } from "./individual-tracker-viewer";
import { useIndividualTrackerViewer } from "./use-individual-tracker-viewer";

interface IndividualTrackerViewerPageProps {
  readonly individualTrackerService?: IndividualTrackerService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly haloClient: HaloInfiniteClient;
  readonly trackerId: string;
}

export function IndividualTrackerViewerPage({
  individualTrackerService,
  individualTrackerViewService,
  haloClient,
  trackerId,
}: IndividualTrackerViewerPageProps): React.ReactElement {
  const { snapshot, model, onSelectMatch, onDeselect, onRetry } = useIndividualTrackerViewer({
    individualTrackerService,
    individualTrackerViewService,
    haloClient,
    trackerId,
  });

  return (
    <ComponentLoader
      status={snapshot.status}
      loading={<LoadingState text="Loading tracker..." />}
      error={<ErrorState message={snapshot.errorMessage ?? "Failed to load tracker"} onRetry={onRetry} />}
      loaded={
        model.renderModel != null ? (
          <IndividualTrackerViewer
            renderModel={model.renderModel}
            connectionStatus={model.connectionStatus}
            selectedMatchId={model.selectedMatchId}
            matchStatsState={model.matchStatsState}
            onSelectMatch={onSelectMatch}
            onDeselect={onDeselect}
          />
        ) : (
          <LoadingState />
        )
      }
    />
  );
}
