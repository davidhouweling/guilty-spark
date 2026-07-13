import React from "react";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { ComponentLoader } from "../../component-loader/component-loader";
import { ErrorState } from "../../error-state/error-state";
import { LoadingState } from "../../loading-state/loading-state";
import type { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import type {
  IndividualTrackerViewService,
  TrackerViewConnectionStatus,
} from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import { IndividualTrackerViewer } from "./individual-tracker-viewer";
import { useIndividualTrackerViewer } from "./use-individual-tracker-viewer";

export interface CreateIndividualTrackerViewerPageConfig {
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
  readonly individualTrackerService?: IndividualTrackerService;
}

export interface IndividualTrackerViewerPageProps {
  readonly trackerId: string;
  readonly streamerSettings?: StreamerViewSettings;
  readonly externalView?: TrackerViewState;
  readonly connectionStatusOverride?: TrackerViewConnectionStatus;
  readonly pageTitleVariant?: "tracker";
}

interface IndividualTrackerViewerPageInternalProps extends IndividualTrackerViewerPageProps {
  readonly config: CreateIndividualTrackerViewerPageConfig;
}

function IndividualTrackerViewerPageInternal({
  config,
  trackerId,
  streamerSettings,
  externalView,
  connectionStatusOverride,
  pageTitleVariant,
}: IndividualTrackerViewerPageInternalProps): React.ReactElement {
  const {
    individualTrackerService,
    individualTrackerViewService,
    matchAnalyticsService,
    seriesMatchesService,
    medalMetadataResolver,
  } = config;
  const canManage = individualTrackerService != null;

  const { snapshot, model, onToggleEntry, onRefresh, onRetry } = useIndividualTrackerViewer({
    individualTrackerService,
    individualTrackerViewService,
    matchAnalyticsService,
    seriesMatchesService,
    medalMetadataResolver,
    trackerId,
    streamerSettings,
    externalView,
  });

  React.useEffect(() => {
    if (pageTitleVariant !== "tracker") {
      return;
    }

    const gamertag = model.renderModel?.gamertag;
    if (gamertag == null || gamertag === "") {
      return;
    }

    document.title = `${gamertag} tracker - Guilty Spark`;
  }, [model.renderModel?.gamertag, pageTitleVariant]);

  return (
    <ComponentLoader
      status={snapshot.status}
      loading={<LoadingState text="Loading tracker..." />}
      error={<ErrorState message={snapshot.errorMessage ?? "Failed to load tracker"} onRetry={onRetry} />}
      loaded={
        model.renderModel != null ? (
          <IndividualTrackerViewer
            renderModel={model.renderModel}
            connectionStatus={connectionStatusOverride ?? model.connectionStatus}
            expandedEntryKeys={model.expandedEntryKeys}
            entryStates={model.entryStates}
            canManage={canManage}
            refreshPending={model.refreshPending}
            onToggleEntry={onToggleEntry}
            onBackToManage={
              canManage
                ? (): void => {
                    window.location.assign("/individual-tracker");
                  }
                : (): void => undefined
            }
            onRefresh={onRefresh}
          />
        ) : (
          <LoadingState />
        )
      }
    />
  );
}

export function createIndividualTrackerViewerPage(
  config: CreateIndividualTrackerViewerPageConfig,
): (props: IndividualTrackerViewerPageProps) => React.ReactElement {
  const Component = (props: IndividualTrackerViewerPageProps): React.ReactElement => (
    <IndividualTrackerViewerPageInternal {...props} config={config} />
  );

  return Component;
}
