import type React from "react";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { LiveTrackerIdentity } from "@guilty-spark/shared/live-tracker/types";
import { ComponentLoader, ComponentLoaderStatus } from "../component-loader/component-loader";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { LiveTrackerService } from "../../services/live-tracker/types";
import type { SeriesMatchesService } from "../../services/series-matches/types";
import type { LivePreSeriesService } from "../../services/live-pre-series/types";
import { LivePreSeriesCache } from "../../services/live-pre-series/cache";
import { SeriesAnalyticsController } from "../../controllers/series-analytics/series-analytics-controller";
import { StatsDetailController } from "../../controllers/stats/stats-detail-controller";
import { SeriesDetailStatsViewModelPresenter } from "../series-stats/series-detail-stats-view-model-presenter";
import { LiveTrackerPresenter } from "./live-tracker-presenter";
import { LiveTrackerStore } from "./live-tracker-store";
import { LiveTrackerView } from "./live-tracker";
import { LiveTrackerProvider } from "./live-tracker-context";

export interface CreateLiveTrackerConfig {
  readonly liveTrackerService: LiveTrackerService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly seriesMatchesService: SeriesMatchesService;
  readonly livePreSeriesService: LivePreSeriesService;
  readonly identity?: LiveTrackerIdentity | undefined;
  readonly onUnavailable?: (() => void) | undefined;
}

interface LiveTrackerInternalProps {
  readonly config: CreateLiveTrackerConfig;
}

function LiveTrackerInternal({ config }: LiveTrackerInternalProps): React.ReactElement {
  const { liveTrackerService, matchAnalyticsService, seriesMatchesService, livePreSeriesService } = config;
  const store = useMemo(() => new LiveTrackerStore(), []);
  const seriesDetailPresenter = useMemo(() => new SeriesDetailStatsViewModelPresenter(new StatsDetailController()), []);
  const livePreSeriesCache = useMemo(() => new LivePreSeriesCache(livePreSeriesService), [livePreSeriesService]);

  const presenter = useMemo(() => {
    const target: { presenter?: LiveTrackerPresenter | undefined } = {};
    const analyticsController = new SeriesAnalyticsController({
      matchAnalyticsService,
      onChange: (analyticsByMatchId): void => {
        Preconditions.checkExists(target.presenter, "Analytics presenter is not initialized").setAnalytics(
          analyticsByMatchId,
        );
      },
    });
    const instance = new LiveTrackerPresenter({
      liveTrackerService,
      getUrl: (): URL => new URL(window.location.href),
      identity: config.identity,
      store,
      seriesMatchesService,
      livePreSeriesCache,
      analyticsController,
    });
    target.presenter = instance;
    return instance;
  }, [liveTrackerService, matchAnalyticsService, seriesMatchesService, livePreSeriesCache, store, config.identity]);

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

  useEffect(() => {
    const current = store.getSnapshot();
    if (
      !current.hasReceivedInitialData &&
      (current.connectionState === "not_found" || current.connectionState === "stopped")
    ) {
      config.onUnavailable?.();
    }
  }, [config.onUnavailable, snapshot.connectionState, snapshot.hasReceivedInitialData, store]);

  const loaderStatus = snapshot.hasReceivedInitialData
    ? ComponentLoaderStatus.LOADED
    : snapshot.connectionState === "error" ||
        snapshot.connectionState === "stopped" ||
        snapshot.connectionState === "not_found"
      ? ComponentLoaderStatus.ERROR
      : ComponentLoaderStatus.LOADING;

  const model = useMemo(() => {
    const detailModel =
      snapshot.seriesDetail == null
        ? null
        : seriesDetailPresenter.present(snapshot.seriesDetail, snapshot.seriesAnalyticsByMatchId);
    return LiveTrackerPresenter.present(snapshot, detailModel);
  }, [snapshot, seriesDetailPresenter]);
  const onAnalyticsTabSelected = useCallback(
    (module: AnalyticsModule, matchId?: string): void => {
      presenter.loadAnalytics(module, matchId);
    },
    [presenter],
  );
  const onRetrySeriesDetails = useCallback((): void => {
    presenter.retrySeriesDetails();
  }, [presenter]);
  const onRetryLivePreSeries = useCallback((): void => {
    presenter.retryLivePreSeries();
  }, [presenter]);

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
          onAnalyticsTabSelected={onAnalyticsTabSelected}
          onRetrySeriesDetails={onRetrySeriesDetails}
          onRetryLivePreSeries={onRetryLivePreSeries}
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
