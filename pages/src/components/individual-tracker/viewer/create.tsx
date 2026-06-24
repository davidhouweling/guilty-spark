import React from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { ComponentLoader } from "../../component-loader/component-loader";
import { ErrorState } from "../../error-state/error-state";
import { LoadingState } from "../../loading-state/loading-state";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import { IndividualTrackerViewer } from "./individual-tracker-viewer";
import { useIndividualTrackerViewer } from "./use-individual-tracker-viewer";

interface IndividualTrackerViewerPageProps {
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
  readonly trackerId: string;
}

export function IndividualTrackerViewerPage({
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  haloClient,
  trackerId,
}: IndividualTrackerViewerPageProps): React.ReactElement {
  const { snapshot, model, onToggleEntry, onRetry } = useIndividualTrackerViewer({
    individualTrackerViewService,
    matchAnalyticsService,
    seriesMatchesService,
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
            expandedEntryKeys={model.expandedEntryKeys}
            entryStates={model.entryStates}
            canManage={true}
            refreshInProgress={false}
            refreshStartedAt={null}
            refreshPending={false}
            refreshMessage={null}
            onToggleEntry={onToggleEntry}
            onBackToManage={(): void => {
              window.location.assign("/individual-tracker");
            }}
            onRefresh={onRetry}
          />
        ) : (
          <LoadingState />
        )
      }
    />
  );
}
