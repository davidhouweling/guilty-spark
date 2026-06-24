import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import { IndividualTrackerViewerPresenter } from "./viewer-presenter";
import type { IndividualTrackerViewerSnapshot } from "./viewer-store";
import { IndividualTrackerViewerStore } from "./viewer-store";
import type { IndividualTrackerViewerViewModel, ViewerTimelineItem } from "./types";

interface UseIndividualTrackerViewerOpts {
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly haloClient: HaloInfiniteClient;
  readonly trackerId: string;
}

export interface IndividualTrackerViewerHookResult {
  readonly snapshot: IndividualTrackerViewerSnapshot;
  readonly model: IndividualTrackerViewerViewModel;
  readonly onToggleEntry: (item: ViewerTimelineItem) => void;
  readonly onRetry: () => void;
}

export function useIndividualTrackerViewer({
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  haloClient,
  trackerId,
}: UseIndividualTrackerViewerOpts): IndividualTrackerViewerHookResult {
  const store = useMemo(() => new IndividualTrackerViewerStore(), []);

  const presenter = useMemo(
    () =>
      new IndividualTrackerViewerPresenter({
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        haloClient,
        store,
        trackerId,
      }),
    [individualTrackerViewService, matchAnalyticsService, seriesMatchesService, haloClient, store, trackerId],
  );

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

  const onToggleEntry = useCallback(
    (item: ViewerTimelineItem): void => {
      presenter.toggleEntry(item);
    },
    [presenter],
  );

  const onRetry = useCallback((): void => {
    presenter.start();
  }, [presenter]);

  return { snapshot, model, onToggleEntry, onRetry };
}
