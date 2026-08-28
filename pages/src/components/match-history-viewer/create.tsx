import React, { useEffect } from "react";
import { ComponentLoader } from "../component-loader/component-loader";
import { Container } from "../container/container";
import { ErrorState } from "../error-state/error-state";
import { Heading } from "../heading/heading";
import { LoadingState } from "../loading-state/loading-state";
import type { HaloMedalMetadataResolver } from "../../services/halo/medal-metadata-resolver";
import type { IndividualTrackerService } from "../../services/individual-tracker/types";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../services/stats/series-matches-types";
import { IndividualTrackerViewer } from "../individual-tracker/viewer/individual-tracker-viewer";
import { GamertagSearchBox } from "./gamertag-search-box";
import styles from "./match-history-viewer.module.css";
import { useMatchHistoryViewer } from "./use-match-history-viewer";

export interface CreateMatchHistoryViewerPageConfig {
  readonly individualTrackerService: IndividualTrackerService;
  readonly individualTrackerSettingsService: IndividualTrackerSettingsService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
}

export interface MatchHistoryViewerPageProps {
  readonly gamertag: string;
}

interface MatchHistoryViewerPageInternalProps extends MatchHistoryViewerPageProps {
  readonly config: CreateMatchHistoryViewerPageConfig;
}

function MatchHistoryViewerPageInternal({ config, gamertag }: MatchHistoryViewerPageInternalProps): React.ReactElement {
  const { snapshot, model, onToggleEntry, onLoadMore } = useMatchHistoryViewer({ ...config, gamertag });

  useEffect(() => {
    const resolvedGamertag = model.renderModel?.gamertag ?? gamertag;
    document.title =
      resolvedGamertag === "" ? "Match History - Guilty Spark" : `${resolvedGamertag} match history - Guilty Spark`;
  }, [model.renderModel?.gamertag, gamertag]);

  return (
    <>
      <Container>
        <Heading tagName="h1" styleAs="h2" variant="display" spacing={4}>
          Match History
        </Heading>
      </Container>
      <GamertagSearchBox initialGamertag={gamertag} />
      {gamertag !== "" && (
        <ComponentLoader
          status={snapshot.status}
          loading={<LoadingState text={`Searching for ${gamertag}...`} />}
          error={<ErrorState message={snapshot.errorMessage ?? "Failed to load match history"} />}
          loaded={
            model.renderModel != null ? (
              <>
                <IndividualTrackerViewer
                  renderModel={model.renderModel}
                  connectionStatus={model.connectionStatus}
                  expandedEntryKeys={model.expandedEntryKeys}
                  entryStates={model.entryStates}
                  canManage={false}
                  refreshPending={false}
                  titleSuffix="Match History"
                  titleTagName="h2"
                  showStatusBadge={false}
                  disableNewEntryTracking={true}
                  hasMore={snapshot.hasMore}
                  loadingMore={snapshot.loadingMore}
                  onToggleEntry={onToggleEntry}
                  onBackToManage={(): void => undefined}
                  onRefresh={(): void => undefined}
                  onLoadMore={onLoadMore}
                />
                {snapshot.loadMoreError != null && <p className={styles.loadMoreError}>{snapshot.loadMoreError}</p>}
              </>
            ) : (
              <LoadingState />
            )
          }
        />
      )}
    </>
  );
}

export function createMatchHistoryViewerPage(
  config: CreateMatchHistoryViewerPageConfig,
): (props: MatchHistoryViewerPageProps) => React.ReactElement {
  const Component = (props: MatchHistoryViewerPageProps): React.ReactElement => (
    <MatchHistoryViewerPageInternal {...props} config={config} />
  );

  return Component;
}
