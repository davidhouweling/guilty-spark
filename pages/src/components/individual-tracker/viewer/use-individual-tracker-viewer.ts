import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { HaloInfiniteClient } from "halo-infinite-api";
import type { IndividualTrackerService } from "../../../services/individual-tracker/types";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import { IndividualTrackerViewerPresenter } from "./viewer-presenter";
import type { IndividualTrackerViewerSnapshot } from "./viewer-store";
import { IndividualTrackerViewerStore } from "./viewer-store";
import type { IndividualTrackerViewerViewModel } from "./types";

interface UseIndividualTrackerViewerOpts {
  readonly individualTrackerService?: IndividualTrackerService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly haloClient: HaloInfiniteClient;
  readonly trackerId: string;
}

export interface IndividualTrackerViewerHookResult {
  readonly snapshot: IndividualTrackerViewerSnapshot;
  readonly model: IndividualTrackerViewerViewModel;
  readonly onSelectMatch: (matchId: string) => void;
  readonly onDeselect: () => void;
  readonly onRetry: () => void;
  readonly onSelectMatches: (matchIds: readonly string[]) => void;
}

export function useIndividualTrackerViewer({
  individualTrackerService,
  individualTrackerViewService,
  haloClient,
  trackerId,
}: UseIndividualTrackerViewerOpts): IndividualTrackerViewerHookResult {
  const store = useMemo(() => new IndividualTrackerViewerStore(), []);

  const presenter = useMemo(
    () =>
      new IndividualTrackerViewerPresenter({
        individualTrackerService,
        individualTrackerViewService,
        haloClient,
        store,
        trackerId,
      }),
    [individualTrackerService, individualTrackerViewService, haloClient, store, trackerId],
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

  const onSelectMatches = useCallback(
    (matchIds: readonly string[]): void => {
      void presenter.selectMatches(matchIds);
    },
    [presenter],
  );

  return { snapshot, model, onSelectMatch, onDeselect, onRetry, onSelectMatches };
}
