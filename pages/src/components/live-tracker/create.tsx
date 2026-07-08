import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import { ComponentLoader, ComponentLoaderStatus } from "../component-loader/component-loader";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { LiveTrackerService } from "../../services/live-tracker/types";
import { LiveTrackerPresenter } from "./live-tracker-presenter";
import { LiveTrackerStore } from "./live-tracker-store";
import { LiveTrackerView } from "./live-tracker";
import { LiveTrackerProvider } from "./live-tracker-context";

export interface CreateLiveTrackerConfig {
  readonly liveTrackerService: LiveTrackerService;
  readonly matchAnalyticsService: MatchAnalyticsService;
}

interface LiveTrackerInternalProps {
  readonly config: CreateLiveTrackerConfig;
}

function LiveTrackerInternal({ config }: LiveTrackerInternalProps): React.ReactElement {
  const { liveTrackerService, matchAnalyticsService } = config;
  const store = useMemo(() => new LiveTrackerStore(), []);

  const presenter = useMemo(
    () =>
      new LiveTrackerPresenter({
        liveTrackerService,
        getUrl: (): URL => new URL(window.location.href),
        store,
        matchAnalyticsService,
      }),
    [liveTrackerService, matchAnalyticsService, store],
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

  const loaderStatus = snapshot.hasReceivedInitialData
    ? ComponentLoaderStatus.LOADED
    : snapshot.connectionState === "error" ||
        snapshot.connectionState === "stopped" ||
        snapshot.connectionState === "not_found"
      ? ComponentLoaderStatus.ERROR
      : ComponentLoaderStatus.LOADING;

  const model = useMemo(() => LiveTrackerPresenter.present(snapshot), [snapshot]);

  return (
    <ComponentLoader
      status={loaderStatus}
      loading={<LoadingState text={snapshot.statusText} />}
      error={
        <ErrorState
          message={snapshot.statusText}
          onRetry={
            snapshot.connectionState === "error" || snapshot.connectionState === "disconnected"
              ? (): void => {
                  presenter.start();
                }
              : undefined
          }
        />
      }
      loaded={
        <LiveTrackerProvider
          model={model}
          params={model.params}
          allMatchStats={model.allMatchStats}
          seriesStats={model.seriesStats}
          analyticsStatus={model.analyticsStatus}
          allMatchKillMatrix={model.allMatchKillMatrix}
          seriesKillMatrix={model.seriesKillMatrix}
        >
          <LiveTrackerView />
        </LiveTrackerProvider>
      }
    />
  );
}

export function createLiveTracker(config: CreateLiveTrackerConfig): () => React.ReactElement {
  const Component = (): React.ReactElement => <LiveTrackerInternal config={config} />;

  return Component;
}
