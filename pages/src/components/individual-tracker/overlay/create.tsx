import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { ComponentLoaderStatus } from "../../component-loader/component-loader";
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
  const { snapshot, model, onSelectMatch, onDeselect } = useIndividualTrackerViewer({
    individualTrackerViewService,
    haloClient,
    trackerId,
  });

  switch (snapshot.status) {
    case ComponentLoaderStatus.PENDING:
    case ComponentLoaderStatus.LOADING: {
      return <LoadingState text="Loading tracker..." />;
    }
    case ComponentLoaderStatus.LOADED: {
      if (model.renderModel != null) {
        return (
          <IndividualTrackerOverlay
            renderModel={model.renderModel}
            matchStatsState={model.matchStatsState}
            selectedMatchId={model.selectedMatchId}
            onSelectMatch={onSelectMatch}
            onDeselect={onDeselect}
          />
        );
      }
      return <LoadingState />;
    }
    case ComponentLoaderStatus.ERROR: {
      return <ErrorState message={snapshot.errorMessage ?? "Failed to load tracker"} />;
    }
    default: {
      throw new UnreachableError(snapshot.status);
    }
  }
}
