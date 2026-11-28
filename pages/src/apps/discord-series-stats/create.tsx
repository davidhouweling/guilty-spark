import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { createDiscordSeriesDetailStats } from "../../components/discord-series-stats/create-detail";
import { SeriesAnalyticsController } from "../../controllers/series-analytics/series-analytics-controller";
import type { DiscordSeriesStatsService } from "../../services/stats/discord-series-types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import type { ViewMode } from "../../components/view-mode/view-mode-selector";
import { useStreamerSettings } from "../../components/live-tracker/settings/use-streamer-settings";
import type { ObserverViewColorSettings, SeriesStreamerSettings } from "../../components/live-tracker/settings/types";
import { DiscordSeriesStatsPresenter } from "./discord-series-stats-presenter";
import { DiscordSeriesStatsStore } from "./discord-series-stats-store";
import { installServices } from "./services";

interface DiscordSeriesStatsAppProps {
  readonly apiHost: string;
  readonly guildId: string;
  readonly queueNumber: string;
}

interface DiscordSeriesStatsDataProps {
  readonly discordSeriesStatsService: DiscordSeriesStatsService;
  readonly matchAnalyticsService: MatchAnalyticsService;
  readonly guildId: string;
  readonly queueNumber: string;
}

function DiscordSeriesStatsData({
  discordSeriesStatsService,
  matchAnalyticsService,
  guildId,
  queueNumber,
}: DiscordSeriesStatsDataProps): ReactElement {
  const { settings, updateGlobalSettings } = useStreamerSettings();
  const [initialSettings] = useState(() => settings);
  const DiscordSeriesStats = useMemo(() => createDiscordSeriesDetailStats(), []);
  const store = useMemo(() => new DiscordSeriesStatsStore(), []);
  const presenter = useMemo(() => {
    const target: { presenter?: DiscordSeriesStatsPresenter | undefined } = {};
    const analyticsController = new SeriesAnalyticsController({
      matchAnalyticsService,
      onChange: (analyticsByMatchId): void => {
        Preconditions.checkExists(target.presenter, "Analytics presenter is not initialized").setAnalytics(
          analyticsByMatchId,
        );
      },
    });
    const instance = new DiscordSeriesStatsPresenter({
      store,
      discordSeriesStatsService,
      analyticsController,
      guildId,
      queueNumber,
      settings: initialSettings,
      updateGlobalSettings,
    });
    target.presenter = instance;
    return instance;
  }, [
    discordSeriesStatsService,
    guildId,
    initialSettings,
    matchAnalyticsService,
    queueNumber,
    store,
    updateGlobalSettings,
  ]);

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

  const model = useMemo(() => DiscordSeriesStatsPresenter.present(snapshot), [snapshot]);
  const streamerSettings = useMemo(
    () => ({
      ...snapshot.urlSettings,
      global: {
        ...snapshot.urlSettings.global,
        viewMode: snapshot.viewMode,
        colors: { ...snapshot.urlSettings.global.colors, observerView: snapshot.observerColors },
      },
      series: snapshot.seriesSettings,
    }),
    [snapshot.observerColors, snapshot.seriesSettings, snapshot.urlSettings, snapshot.viewMode],
  );
  const onAnalyticsTabSelected = useCallback(
    (module: AnalyticsModule, matchId?: string): void => {
      presenter.loadAnalytics(module, matchId);
    },
    [presenter],
  );
  const onViewModeSelect = useCallback(
    (mode: ViewMode): void => {
      presenter.setViewMode(mode);
    },
    [presenter],
  );
  const onViewPreviewChange = useCallback(
    (enabled: boolean): void => {
      presenter.setViewPreview(enabled);
    },
    [presenter],
  );
  const onSeriesSettingsChange = useCallback(
    (updates: Partial<SeriesStreamerSettings>): void => {
      presenter.setSeriesSettings(updates);
    },
    [presenter],
  );
  const onObserverColorsChange = useCallback(
    (updates: Partial<ObserverViewColorSettings>): void => {
      presenter.setObserverColors(updates);
    },
    [presenter],
  );
  const loaderStatus =
    model.state === "loading"
      ? ComponentLoaderStatus.LOADING
      : model.state === "error"
        ? ComponentLoaderStatus.ERROR
        : ComponentLoaderStatus.LOADED;

  return (
    <ComponentLoader
      status={loaderStatus}
      loading={<LoadingState text="Loading queue stats..." />}
      error={<ErrorState message={model.state === "error" ? model.message : "Failed to load stats"} />}
      loaded={
        model.state === "resolved" ? (
          <DiscordSeriesStats
            data={model.data}
            analyticsByMatchId={snapshot.analyticsByMatchId}
            viewMode={snapshot.viewMode}
            streamerSettings={streamerSettings}
            seriesSettings={snapshot.seriesSettings}
            observerColors={snapshot.observerColors}
            onObserverColorsChange={onObserverColorsChange}
            onSeriesSettingsChange={onSeriesSettingsChange}
            onViewPreviewChange={onViewPreviewChange}
            onViewModeSelect={onViewModeSelect}
            onAnalyticsTabSelected={onAnalyticsTabSelected}
          />
        ) : model.state === "pending-index" ? (
          <LoadingState
            text={`Stats are still indexing. Retry in ${Math.ceil(model.retryAfterSeconds).toString()}s.`}
          />
        ) : model.state === "forbidden" ? (
          <ErrorState message={`Access forbidden: ${model.reason}`} />
        ) : (
          <ErrorState
            message={model.state === "not-found" ? `Queue not found: ${model.reason}` : "Unable to load stats"}
          />
        )
      }
    />
  );
}

export function DiscordSeriesStatsApp({ apiHost, guildId, queueNumber }: DiscordSeriesStatsAppProps): ReactElement {
  const [loadingServices, setLoadingServices] = useState(ComponentLoaderStatus.PENDING);
  const [services, setServices] = useState<Awaited<ReturnType<typeof installServices>> | null>(null);

  useEffect(() => {
    let isCancelled = false;

    setServices(null);
    setLoadingServices(ComponentLoaderStatus.PENDING);

    async function loadServices(): Promise<void> {
      try {
        const installedServices = await installServices(apiHost);
        if (isCancelled) {
          return;
        }

        setServices(installedServices);
        setLoadingServices(ComponentLoaderStatus.LOADED);
      } catch {
        if (isCancelled) {
          return;
        }

        setLoadingServices(ComponentLoaderStatus.ERROR);
      }
    }

    void loadServices();

    return (): void => {
      isCancelled = true;
    };
  }, [apiHost]);

  return (
    <ComponentLoader
      status={loadingServices}
      loading={<LoadingState text="Loading queue stats..." />}
      error={<ErrorState message="Failed to load stats service" />}
      loaded={
        services != null ? (
          <DiscordSeriesStatsData
            discordSeriesStatsService={services.discordSeriesStatsService}
            matchAnalyticsService={services.matchAnalyticsService}
            guildId={guildId}
            queueNumber={queueNumber}
          />
        ) : (
          <ErrorState message="Stats service failed to load" />
        )
      }
    />
  );
}
