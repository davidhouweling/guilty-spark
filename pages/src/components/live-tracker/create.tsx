import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import { installServices } from "../../services/install";
import type { Services } from "../../services/types";
import { ComponentLoader, ComponentLoaderStatus } from "../component-loader/component-loader";
import { LiveTrackerPresenter } from "./live-tracker-presenter";
import { LiveTrackerStore } from "./live-tracker-store";
import { LiveTrackerView } from "./live-tracker";

interface LiveTrackerAppProps {
  readonly apiHost: string;
}

interface LiveTrackerFactoryProps {
  readonly services: Services;
}

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
  const model = LiveTrackerPresenter.present(snapshot);

  return <LiveTrackerView model={model} />;
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

  const loaded = services ? <LiveTrackerFactory services={services} /> : <div>Error</div>;

  return (
    <ComponentLoader
      status={loadingServices}
      loading={<div>Loading...</div>}
      error={<div>Error</div>}
      loaded={loaded}
    />
  );
}
