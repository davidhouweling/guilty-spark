import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import { IndividualTrackerViewerPresenter } from "./viewer-presenter";
import type { IndividualTrackerViewerSnapshot } from "./viewer-store";
import { IndividualTrackerViewerStore } from "./viewer-store";
import type { IndividualTrackerViewerViewModel } from "./types";

interface UseIndividualTrackerViewerOpts {
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly haloClient: HaloInfiniteClient;
  readonly trackerId: string;
}

export interface IndividualTrackerViewerHookResult {
  readonly snapshot: IndividualTrackerViewerSnapshot;
  readonly model: IndividualTrackerViewerViewModel;
  readonly onSelectMatch: (matchId: string) => void;
  readonly onDeselect: () => void;
  readonly onRetry: () => void;
}

export function useIndividualTrackerViewer({
  individualTrackerViewService,
  matchAnalyticsService,
  haloClient,
  trackerId,
}: UseIndividualTrackerViewerOpts): IndividualTrackerViewerHookResult {
  const store = useMemo(() => new IndividualTrackerViewerStore(), []);

  const presenter = useMemo(
    () =>
      new IndividualTrackerViewerPresenter({
        individualTrackerViewService,
        matchAnalyticsService,
        haloClient,
        store,
        trackerId,
      }),
    [individualTrackerViewService, matchAnalyticsService, haloClient, store, trackerId],
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

  const onSelectMatch = useCallback(
    (matchId: string): void => {
      presenter.selectMatch(matchId);
    },
    [presenter],
  );

  const onDeselect = useCallback((): void => {
    presenter.deselectMatch();
  }, [presenter]);

  const onRetry = useCallback((): void => {
    presenter.start();
  }, [presenter]);

  return { snapshot, model, onSelectMatch, onDeselect, onRetry };
}
