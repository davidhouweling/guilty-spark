import React, { useEffect, useMemo, useSyncExternalStore } from "react";
import { installServices } from "../../services/install";
import type { Services } from "../../services/types";
import { ComponentLoader, ComponentLoaderStatus } from "../component-loader/component-loader";
import { TrackerWebSocketDemoPresenter } from "./tracker-websocket-demo.presenter";
import { TrackerWebSocketDemoStore } from "./tracker-websocket-demo.store";
import { TrackerWebSocketDemoView } from "./tracker-websocket-demo.view";

interface TrackerWebSocketDemoAppProps {
  readonly apiHost: string;
}

interface TrackerWebSocketDemoFactoryProps {
  readonly services: Services;
}

export function TrackerWebSocketDemoFactory({ services }: TrackerWebSocketDemoFactoryProps): React.ReactElement {
  const store = useMemo(() => new TrackerWebSocketDemoStore(), []);

  const presenter = useMemo(() => {
    return new TrackerWebSocketDemoPresenter({
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
  const model = TrackerWebSocketDemoPresenter.present(snapshot);

  return (
    <TrackerWebSocketDemoView
      model={model}
      onDisconnect={() => {
        presenter.disconnect();
      }}
    />
  );
}

export function TrackerWebSocketDemo({ apiHost }: TrackerWebSocketDemoAppProps): React.ReactElement {
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

  const loaded = services ? <TrackerWebSocketDemoFactory services={services} /> : <div>Error</div>;

  return (
    <ComponentLoader
      status={loadingServices}
      loading={<div>Loading...</div>}
      error={<div>Error</div>}
      loaded={loaded}
    />
  );
}
