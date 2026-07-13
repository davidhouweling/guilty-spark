import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { TrackerViewState } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/stats/series-matches-types";
import { IndividualTrackerViewerPresenter } from "./viewer-presenter";
import type { IndividualTrackerViewerSnapshot } from "./viewer-store";
import { IndividualTrackerViewerStore } from "./viewer-store";
import type { IndividualTrackerViewerViewModel, ViewerTimelineItem } from "./types";

interface UseIndividualTrackerViewerOpts {
  readonly individualTrackerService?: IndividualTrackerService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly medalMetadataResolver: HaloMedalMetadataResolver;
  readonly trackerId: string;
  readonly streamerSettings?: StreamerViewSettings;
  readonly externalView?: TrackerViewState;
}

export interface IndividualTrackerViewerHookResult {
  readonly snapshot: IndividualTrackerViewerSnapshot;
  readonly model: IndividualTrackerViewerViewModel;
  readonly onToggleEntry: (item: ViewerTimelineItem) => void;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
}

export function useIndividualTrackerViewer({
  individualTrackerService,
  individualTrackerViewService,
  matchAnalyticsService,
  seriesMatchesService,
  medalMetadataResolver,
  trackerId,
  streamerSettings,
  externalView,
}: UseIndividualTrackerViewerOpts): IndividualTrackerViewerHookResult {
  const store = useMemo(() => new IndividualTrackerViewerStore(), []);

  const presenter = useMemo(
    () =>
      new IndividualTrackerViewerPresenter({
        individualTrackerService,
        individualTrackerViewService,
        matchAnalyticsService,
        seriesMatchesService,
        medalMetadataResolver,
        store,
        trackerId,
      }),
    [
      individualTrackerService,
      individualTrackerViewService,
      matchAnalyticsService,
      seriesMatchesService,
      medalMetadataResolver,
      store,
      trackerId,
    ],
  );

  useEffect(() => {
    presenter.setStreamerSettings(streamerSettings);
  }, [presenter, streamerSettings]);

  useEffect(() => {
    if (externalView != null) {
      presenter.setExternalView(externalView);
      return;
    }
    presenter.start();
  }, [externalView, presenter]);

  useEffect(
    () => (): void => {
      presenter.dispose();
    },
    [presenter],
  );

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

  const onRefresh = useCallback((): void => {
    presenter.refresh();
  }, [presenter]);

  return { snapshot, model, onToggleEntry, onRefresh, onRetry };
}
