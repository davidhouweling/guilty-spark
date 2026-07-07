import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { ComponentLoader } from "../../component-loader/component-loader";
import { ErrorState } from "../../error-state/error-state";
import { LoadingState } from "../../loading-state/loading-state";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import { useIndividualTrackerViewer } from "../viewer/use-individual-tracker-viewer";
import { IndividualTrackerOverlay } from "./individual-tracker-overlay";
import { IndividualTrackerOverlayPresenter } from "./individual-tracker-overlay-presenter";
import { OverlayPagePresenter } from "./overlay-page-presenter";
import { OverlayPageStore } from "./overlay-page-store";

interface IndividualTrackerOverlayPageProps {
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
  readonly trackerId: string;
  readonly externalView?: TrackerViewState;
  readonly showPreview?: boolean;
  readonly previewMode?: "player" | "observer";
}

export function IndividualTrackerOverlayPage({
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  haloClient,
  trackerId,
  externalView,
  showPreview = false,
  previewMode = "observer",
}: IndividualTrackerOverlayPageProps): React.ReactElement {
  const store = useMemo(() => new OverlayPageStore(), [trackerId]);

  const presenter = useMemo(
    () =>
      new OverlayPagePresenter({
        store,
        haloClient,
        matchAnalyticsService,
      }),
    [haloClient, matchAnalyticsService, store],
  );

  const { snapshot, model, onRetry, onToggleEntry } = useIndividualTrackerViewer({
    individualTrackerViewService,
    matchAnalyticsService,
    seriesMatchesService,
    haloClient,
    trackerId,
    externalView,
  });

  useEffect(() => {
    presenter.reset();
    return (): void => {
      presenter.dispose();
    };
  }, [presenter]);

  useEffect(() => {
    if (model.renderModel == null) {
      return;
    }

    const matchIds = new Set<string>();
    for (const item of model.renderModel.timeline) {
      if (item.type === "match") {
        matchIds.add(item.match.matchId);
        continue;
      }

      for (const match of item.series.matches) {
        matchIds.add(match.matchId);
      }
    }

    presenter.preloadMatchStats([...matchIds]);
  }, [model.renderModel, presenter]);

  const overlaySnapshot = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );

  const overlayModel = useMemo(() => presenter.present(overlaySnapshot), [overlaySnapshot, presenter]);
  const overlayPresenter = useMemo(() => new IndividualTrackerOverlayPresenter(), []);
  const selectedSeriesEntryState = useMemo(() => {
    if (overlayModel.selectedSeriesId == null) {
      return null;
    }

    return model.entryStates.get(`series:${overlayModel.selectedSeriesId}`) ?? null;
  }, [model.entryStates, overlayModel.selectedSeriesId]);
  const overlayViewModel = useMemo(
    () =>
      model.renderModel != null
        ? overlayPresenter.present({
            renderModel: model.renderModel,
            streamerSettings: model.streamerSettings,
            matchStatsByMatchId: overlaySnapshot.matchStatsByMatchId,
            selectedMatchId: overlayModel.selectedMatchId,
            selectedSeriesId: overlayModel.selectedSeriesId,
          })
        : null,
    [
      model.renderModel,
      model.streamerSettings,
      overlaySnapshot.matchStatsByMatchId,
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
        selectedSeriesEntryState?.state ?? null,
      ),
    [
      overlayModel.matchStatsState,
      overlayModel.selectedMatchId,
      overlayModel.selectedSeriesId,
      overlayPresenter,
      selectedSeriesEntryState,
    ],
  );

  return (
    <ComponentLoader
      status={snapshot.status}
      loading={<LoadingState text="Loading tracker..." />}
      error={<ErrorState message={snapshot.errorMessage ?? "Failed to load tracker"} onRetry={onRetry} />}
      loaded={
        model.renderModel != null && overlayViewModel != null ? (
          <IndividualTrackerOverlay
            viewModel={overlayViewModel}
            isPanelOpen={isPanelOpen}
            matchesLength={model.renderModel.accumulated.total}
            matchStatsPanelState={overlayModel.matchStatsPanelState}
            seriesStatsPanelState={
              selectedSeriesEntryState?.kind === "series" ? selectedSeriesEntryState.state : null
            }
            selectedMatchId={overlayModel.selectedMatchId}
            selectedSeriesId={overlayModel.selectedSeriesId}
            showPreview={showPreview}
            previewMode={previewMode}
            onSelectMatch={(matchId): void => {
              presenter.selectMatch(matchId);
            }}
            onSelectSeries={(seriesId): void => {
              presenter.selectSeriesAndToggleIfAvailable(model.renderModel?.timeline ?? null, seriesId, onToggleEntry);
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
