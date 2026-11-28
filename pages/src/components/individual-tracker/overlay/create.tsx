import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { ComponentLoader } from "../../component-loader/component-loader";
import { ErrorState } from "../../error-state/error-state";
import { LoadingState } from "../../loading-state/loading-state";
import type { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/series-matches/types";
import { useIndividualTrackerViewer } from "../viewer/use-individual-tracker-viewer";
import { IndividualTrackerOverlay } from "./individual-tracker-overlay";
import { IndividualTrackerOverlayPresenter } from "./individual-tracker-overlay-presenter";
import { OverlayPagePresenter } from "./overlay-page-presenter";
import { OverlayPageStore } from "./overlay-page-store";

export interface CreateIndividualTrackerOverlayPageConfig {
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
}

export interface IndividualTrackerOverlayPageProps {
  readonly trackerId: string;
  readonly externalView?: TrackerViewState;
  readonly showPreview?: boolean;
  readonly previewMode?: "player" | "observer";
}

interface IndividualTrackerOverlayPageInternalProps extends IndividualTrackerOverlayPageProps {
  readonly config: CreateIndividualTrackerOverlayPageConfig;
}

function IndividualTrackerOverlayPageInternal({
  config,
  trackerId,
  externalView,
  showPreview = false,
  previewMode = "observer",
}: IndividualTrackerOverlayPageInternalProps): React.ReactElement {
  const {
    individualTrackerViewService,
    matchAnalyticsService,
    seriesMatchesService,
    haloClient,
    medalMetadataResolver,
  } = config;
  const store = useMemo(() => new OverlayPageStore(), []);
  const presenter = useMemo(
    () =>
      new OverlayPagePresenter({
        store,
        haloClient,
        medalMetadataResolver,
        matchAnalyticsService,
        seriesMatchesService,
        trackerId,
      }),
    [haloClient, medalMetadataResolver, matchAnalyticsService, seriesMatchesService, store, trackerId],
  );

  const { snapshot, model, onRetry } = useIndividualTrackerViewer({
    individualTrackerViewService,
    matchAnalyticsService,
    seriesMatchesService,
    medalMetadataResolver,
    trackerId,
    externalView,
  });

  useEffect(() => {
    return (): void => {
      presenter.dispose();
    };
  }, [presenter]);

  useEffect(() => {
    presenter.reset();
  }, [presenter, trackerId]);

  useEffect(() => {
    if (model.renderModel?.trackerId !== trackerId) {
      return;
    }

    presenter.preloadTimelineMatchStats(model.renderModel.timeline);
  }, [model.renderModel, presenter, trackerId]);

  const overlaySnapshot = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );

  const overlayModel = useMemo(() => presenter.present(overlaySnapshot), [overlaySnapshot, presenter]);
  const overlayPresenter = useMemo(() => new IndividualTrackerOverlayPresenter(), []);
  const selectedMatch = useMemo(
    () =>
      model.renderModel == null
        ? null
        : presenter.findSelectedMatch(model.renderModel.timeline, overlayModel.selectedMatchId),
    [model.renderModel, overlayModel.selectedMatchId, presenter],
  );
  const selectedSeries = useMemo(
    () =>
      model.renderModel == null
        ? null
        : presenter.findSelectedSeries(model.renderModel.timeline, overlayModel.selectedSeriesId),
    [model.renderModel, overlayModel.selectedSeriesId, presenter],
  );
  const selectedSeriesPanelState = useMemo(
    () => presenter.buildSeriesStatsPanelState(selectedSeries, overlaySnapshot.seriesDetailsById),
    [presenter, selectedSeries, overlaySnapshot.seriesDetailsById],
  );
  const overlayViewModel = useMemo(
    () =>
      model.renderModel != null
        ? overlayPresenter.present({
            renderModel: model.renderModel,
            streamerSettings: model.streamerSettings,
            matchStatsByMatchId: overlaySnapshot.matchStatsByMatchId,
            seriesDetailsById: overlaySnapshot.seriesDetailsById,
            selectedMatchId: overlayModel.selectedMatchId,
            selectedSeriesId: overlayModel.selectedSeriesId,
          })
        : null,
    [
      model.renderModel,
      model.streamerSettings,
      overlaySnapshot.matchStatsByMatchId,
      overlaySnapshot.seriesDetailsById,
      overlayModel.selectedMatchId,
      overlayModel.selectedSeriesId,
      overlayPresenter,
    ],
  );
  const isPanelOpen = useMemo(
    () =>
      overlayPresenter.isPanelOpen(
        overlayModel.selectedMatchId,
        overlayModel.matchStatsState,
        overlayModel.selectedSeriesId,
        selectedSeriesPanelState,
      ),
    [
      overlayModel.matchStatsState,
      overlayModel.selectedMatchId,
      overlayModel.selectedSeriesId,
      overlayPresenter,
      selectedSeriesPanelState,
    ],
  );

  return (
    <ComponentLoader
      status={snapshot.status}
      loading={<LoadingState text="Loading tracker..." />}
      error={<ErrorState message={snapshot.errorMessage ?? "Failed to load tracker"} onRetry={onRetry} />}
      loaded={
        model.renderModel?.trackerId === trackerId && overlayViewModel != null ? (
          <IndividualTrackerOverlay
            viewModel={overlayViewModel}
            isPanelOpen={isPanelOpen}
            matchesLength={model.renderModel.accumulated.total}
            matchStatsPanelState={overlayModel.matchStatsPanelState}
            seriesStatsPanelState={selectedSeriesPanelState}
            selectedMatch={selectedMatch}
            selectedSeries={selectedSeries}
            selectedMatchId={overlayModel.selectedMatchId}
            selectedSeriesId={overlayModel.selectedSeriesId}
            showPreview={showPreview}
            previewMode={previewMode}
            onSelectMatch={(matchId): void => {
              presenter.selectMatch(matchId, model.renderModel?.timeline);
            }}
            onSelectSeries={(seriesId): void => {
              presenter.selectSeries(seriesId);
            }}
            onSeriesAnalyticsTabSelected={(seriesId, module, matchId): void => {
              presenter.loadSeriesAnalytics(seriesId, module, matchId);
            }}
            onDeselect={(): void => {
              presenter.deselect();
            }}
          />
        ) : (
          <LoadingState />
        )
      }
    />
  );
}

export function createIndividualTrackerOverlayPage(
  config: CreateIndividualTrackerOverlayPageConfig,
): (props: IndividualTrackerOverlayPageProps) => React.ReactElement {
  const Component = (props: IndividualTrackerOverlayPageProps): React.ReactElement => (
    <IndividualTrackerOverlayPageInternal {...props} config={config} />
  );

  return Component;
}
