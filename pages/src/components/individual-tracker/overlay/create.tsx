import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import { ComponentLoader } from "../../component-loader/component-loader";
import { ErrorState } from "../../error-state/error-state";
import { LoadingState } from "../../loading-state/loading-state";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import { useIndividualTrackerViewer } from "../viewer/use-individual-tracker-viewer";
import { IndividualTrackerOverlay } from "./individual-tracker-overlay";
import { OverlayPagePresenter } from "./overlay-page-presenter";
import { OverlayPageStore } from "./overlay-page-store";

interface IndividualTrackerOverlayPageProps {
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
  readonly trackerId: string;
}

export function IndividualTrackerOverlayPage({
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  haloClient,
  trackerId,
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

  const { snapshot, model, onRetry } = useIndividualTrackerViewer({
    individualTrackerViewService,
    matchAnalyticsService,
    seriesMatchesService,
    haloClient,
    trackerId,
  });

  useEffect(() => {
    presenter.reset();
    return (): void => {
      presenter.dispose();
    };
  }, [presenter]);

  const overlaySnapshot = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getSnapshot(),
    () => store.getSnapshot(),
  );

  const overlayModel = useMemo(() => presenter.present(overlaySnapshot), [overlaySnapshot, presenter]);

  return (
    <ComponentLoader
      status={snapshot.status}
      loading={<LoadingState text="Loading tracker..." />}
      error={<ErrorState message={snapshot.errorMessage ?? "Failed to load tracker"} onRetry={onRetry} />}
      loaded={
        model.renderModel != null ? (
          <IndividualTrackerOverlay
            renderModel={model.renderModel}
            streamerSettings={model.streamerSettings}
            matchStatsState={overlayModel.matchStatsState}
            matchStatsPanelState={overlayModel.matchStatsPanelState}
            selectedMatchId={overlayModel.selectedMatchId}
            onSelectMatch={(matchId): void => {
              presenter.selectMatch(matchId);
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
