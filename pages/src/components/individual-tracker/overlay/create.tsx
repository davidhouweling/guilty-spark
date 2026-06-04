import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { ComponentLoader } from "../../component-loader/component-loader";
import { ErrorState } from "../../error-state/error-state";
import { LoadingState } from "../../loading-state/loading-state";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import { useIndividualTrackerViewer } from "../viewer/use-individual-tracker-viewer";
import { IndividualTrackerOverlay } from "./individual-tracker-overlay";

interface IndividualTrackerOverlayPageProps {
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly haloClient: HaloInfiniteClient;
  readonly trackerId: string;
}

export function IndividualTrackerOverlayPage({
  individualTrackerViewService,
  haloClient,
  trackerId,
}: IndividualTrackerOverlayPageProps): React.ReactElement {
  const { snapshot, model, onSelectMatch, onDeselect, onRetry } = useIndividualTrackerViewer({
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
          <IndividualTrackerOverlay
            renderModel={model.renderModel}
            matchStatsState={model.matchStatsState}
            selectedMatchId={model.selectedMatchId}
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
