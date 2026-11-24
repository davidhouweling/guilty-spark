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
import { DEFAULT_VIEW_MODE } from "../../components/live-tracker/settings/types";
import type { ObserverViewColorSettings, SeriesStreamerSettings } from "../../components/live-tracker/settings/types";
import { useStreamerSettings } from "../../components/live-tracker/settings/use-streamer-settings";
import {
  buildUrlWithViewMode,
  encodeSettingsToUrlParams,
  parseSettingsFromUrl,
} from "../../components/live-tracker/settings/settings-url-params";
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
  const DiscordSeriesStats = useMemo(() => createDiscordSeriesDetailStats(), []);
  const store = useMemo(() => new DiscordSeriesStatsStore(), []);
  const [seriesSettings, setSeriesSettings] = useState<SeriesStreamerSettings>(() =>
    typeof window === "undefined"
      ? settings.series
      : parseSettingsFromUrl(new URLSearchParams(window.location.search), settings).series,
  );
  const [observerColors, setObserverColors] = useState<ObserverViewColorSettings>(() =>
    typeof window === "undefined"
      ? settings.global.colors.observerView
      : parseSettingsFromUrl(new URLSearchParams(window.location.search), settings).global.colors.observerView,
  );
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") {
      return DEFAULT_VIEW_MODE;
    }

    const urlViewMode = parseSettingsFromUrl(new URLSearchParams(window.location.search), settings).global.viewMode;
    return urlViewMode === "standard" ? "standard" : "wide";
  });

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
    });
    target.presenter = instance;
    return instance;
  }, [discordSeriesStatsService, guildId, matchAnalyticsService, queueNumber, store]);

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
  const onAnalyticsTabSelected = useCallback(
    (module: AnalyticsModule, matchId?: string): void => {
      presenter.loadAnalytics(module, matchId);
    },
    [presenter],
  );
  const onViewModeSelect = useCallback((mode: ViewMode): void => {
    const archiveViewMode = mode === "standard" ? "standard" : "wide";
    setViewMode(archiveViewMode);
    if (typeof window !== "undefined") {
      window.history.replaceState(
        window.history.state,
        "",
        buildUrlWithViewMode(window.location.href, archiveViewMode),
      );
    }
  }, []);
  const onSeriesSettingsChange = useCallback(
    (updates: Partial<SeriesStreamerSettings>): void => {
      const next = { ...seriesSettings, ...updates };
      setSeriesSettings(next);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        const params = encodeSettingsToUrlParams({ ...settings, series: next });
        for (const key of ["title", "subtitle", "eagleTeamName", "cobraTeamName"]) {
          if (Object.hasOwn(params, key)) {
            url.searchParams.set(key, params[key]);
          } else {
            url.searchParams.delete(key);
          }
        }
        window.history.replaceState(window.history.state, "", url.toString());
      }
    },
    [seriesSettings, settings],
  );
  const onObserverColorsChange = useCallback(
    (updates: Partial<ObserverViewColorSettings>): void => {
      setObserverColors((previous) => ({ ...previous, ...updates }));
      updateGlobalSettings({
        colors: {
          ...settings.global.colors,
          observerView: { ...settings.global.colors.observerView, ...updates },
        },
      });
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (updates.eagleColor != null) {
          url.searchParams.set("eagleColor", updates.eagleColor);
        }
        if (updates.cobraColor != null) {
          url.searchParams.set("cobraColor", updates.cobraColor);
        }
        window.history.replaceState(window.history.state, "", url.toString());
      }
    },
    [settings.global.colors, updateGlobalSettings],
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
            viewMode={viewMode}
            seriesSettings={seriesSettings}
            observerColors={observerColors}
            onObserverColorsChange={onObserverColorsChange}
            onSeriesSettingsChange={onSeriesSettingsChange}
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
