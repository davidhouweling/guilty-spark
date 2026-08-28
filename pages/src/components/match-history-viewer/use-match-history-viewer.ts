import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { HaloMedalMetadataResolver } from "../../services/halo/medal-metadata-resolver";
import type { IndividualTrackerService } from "../../services/individual-tracker/types";
import type { IndividualTrackerSettingsService } from "../../services/individual-tracker/settings-types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../services/stats/series-matches-types";
import { IndividualTrackerViewerPresenter } from "../individual-tracker/viewer/viewer-presenter";
import { IndividualTrackerViewerStore } from "../individual-tracker/viewer/viewer-store";
import type { IndividualTrackerViewerSnapshot } from "../individual-tracker/viewer/viewer-store";
import type { IndividualTrackerViewerViewModel, ViewerTimelineItem } from "../individual-tracker/viewer/types";
import { MatchHistoryViewerPresenter } from "./match-history-viewer-presenter";

interface UseMatchHistoryViewerOpts {
  readonly individualTrackerService: IndividualTrackerService;
  readonly individualTrackerSettingsService: IndividualTrackerSettingsService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
  readonly gamertag: string;
}

export interface MatchHistoryViewerHookResult {
  readonly snapshot: IndividualTrackerViewerSnapshot;
  readonly model: IndividualTrackerViewerViewModel;
  readonly onToggleEntry: (item: ViewerTimelineItem) => void;
  readonly onLoadMore: () => void;
}

export function useMatchHistoryViewer({
  individualTrackerService,
  individualTrackerSettingsService,
  matchAnalyticsService,
  seriesMatchesService,
  medalMetadataResolver,
  gamertag,
}: UseMatchHistoryViewerOpts): MatchHistoryViewerHookResult {
  const viewerStore = useMemo(() => new IndividualTrackerViewerStore(), []);

  const presenter = useMemo(
    () =>
      new MatchHistoryViewerPresenter({
        individualTrackerService,
        individualTrackerSettingsService,
        matchAnalyticsService,
        seriesMatchesService,
        medalMetadataResolver,
        viewerStore,
      }),
    [
      individualTrackerService,
      individualTrackerSettingsService,
      matchAnalyticsService,
      seriesMatchesService,
      medalMetadataResolver,
      viewerStore,
    ],
  );

  useEffect(() => {
    if (gamertag === "") {
      return;
    }
    presenter.search(gamertag);
  }, [presenter, gamertag]);

  useEffect(
    () => (): void => {
      presenter.dispose();
    },
    [presenter],
  );

  const viewerSnapshot = useSyncExternalStore(
    (listener) => viewerStore.subscribe(listener),
    () => viewerStore.getSnapshot(),
    () => viewerStore.getSnapshot(),
  );

  const model = useMemo(() => IndividualTrackerViewerPresenter.present(viewerSnapshot), [viewerSnapshot]);

  const onToggleEntry = useCallback(
    (item: ViewerTimelineItem): void => {
      presenter.toggleEntry(item);
    },
    [presenter],
  );

  const onLoadMore = useCallback((): void => {
    presenter.loadMore();
  }, [presenter]);

  return { snapshot: viewerSnapshot, model, onToggleEntry, onLoadMore };
}
