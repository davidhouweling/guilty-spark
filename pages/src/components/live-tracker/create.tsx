import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";
import { installServices } from "../../services/install";
import type { Services } from "../../services/types";
import { ComponentLoader, ComponentLoaderStatus } from "../component-loader/component-loader";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import { LiveTrackerPresenter } from "./live-tracker-presenter";
import { LiveTrackerStore } from "./live-tracker-store";
import { LiveTrackerView } from "./live-tracker";

interface LiveTrackerAppProps {
  readonly apiHost: string;
}

interface LiveTrackerFactoryProps {
  readonly services: Services;
}

TimeAgo.addDefaultLocale(en);

export function LiveTrackerFactory({ services }: LiveTrackerFactoryProps): React.ReactElement {
  const store = useMemo(() => new LiveTrackerStore(), []);

  const presenter = useMemo(() => {
    return new LiveTrackerPresenter({
      services,
      getUrl: (): URL => new URL(window.location.href),
      store,
    });
  }, [services, store]);

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

  const loaderStatus =
    snapshot.connectionState === "error"
      ? ComponentLoaderStatus.ERROR
      : snapshot.hasReceivedInitialData
        ? ComponentLoaderStatus.LOADED
        : ComponentLoaderStatus.LOADING;

  const model = LiveTrackerPresenter.present(snapshot);

  return (
    <ComponentLoader
      status={loaderStatus}
      loading={<LoadingState />}
      error={
        <ErrorState
          message={snapshot.statusText}
          onRetry={() => {
            presenter.start();
          }}
        />
      }
      loaded={<LiveTrackerView model={model} />}
    />
  );
}

export function LiveTracker({ apiHost }: LiveTrackerAppProps): React.ReactElement {
  const [loadingServices, setLoadingServices] = React.useState<ComponentLoaderStatus>(ComponentLoaderStatus.PENDING);
  const [services, setServices] = React.useState<Services | null>(null);

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

  const loaded = services ? <LiveTrackerFactory services={services} /> : <ErrorState />;

  return <ComponentLoader status={loadingServices} loading={<LoadingState />} error={<ErrorState />} loaded={loaded} />;
}
