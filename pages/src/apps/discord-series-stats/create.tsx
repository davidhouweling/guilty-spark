import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { DiscordSeriesStats } from "../../components/discord-series-stats/create";
import type { DiscordSeriesStatsService } from "../../services/stats/discord-series-types";
import { DiscordSeriesStatsPresenter } from "./discord-series-stats-presenter";
import { DiscordSeriesStatsStore } from "./discord-series-stats-store";
import type { Services } from "./services";
import { installServices } from "./services";

interface DiscordSeriesStatsAppProps {
  readonly apiHost: string;
  readonly guildId: string;
  readonly queueNumber: string;
}

interface DiscordSeriesStatsDataProps {
  readonly discordSeriesStatsService: DiscordSeriesStatsService;
  readonly guildId: string;
  readonly queueNumber: string;
}

function DiscordSeriesStatsData({
  discordSeriesStatsService,
  guildId,
  queueNumber,
}: DiscordSeriesStatsDataProps): ReactElement {
  const store = useMemo(() => new DiscordSeriesStatsStore(), []);

  const presenter = useMemo(() => {
    return new DiscordSeriesStatsPresenter({
      store,
      discordSeriesStatsService,
      guildId,
      queueNumber,
    });
  }, [discordSeriesStatsService, guildId, queueNumber, store]);

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
          <DiscordSeriesStats data={model.data} />
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
  const [services, setServices] = useState<Services | null>(null);

  useEffect(() => {
    let isCancelled = false;

    setServices(null);
    setLoadingServices(ComponentLoaderStatus.PENDING);

    installServices(apiHost)
      .then((installedServices) => {
        if (isCancelled) {
          return;
        }

        setServices(installedServices);
        setLoadingServices(ComponentLoaderStatus.LOADED);
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }

        setLoadingServices(ComponentLoaderStatus.ERROR);
      });

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
