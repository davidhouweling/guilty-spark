import React, { useEffect, useState } from "react";
import { installServices } from "../services/install";
import type { Services } from "../services/types";
import { ComponentLoader, ComponentLoaderStatus } from "../components/component-loader/component-loader";

interface BaseAppProps {
  readonly apiHost: string;
  readonly loading: React.ReactElement;
  readonly error: React.ReactElement;
  readonly loaded: (services: Services) => React.ReactElement;
}

export function BaseApp({ apiHost, loading, error, loaded }: BaseAppProps): React.ReactElement {
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

  if (services == null) {
    return loading;
  }

  return <ComponentLoader status={loadingServices} loading={loading} error={error} loaded={loaded(services)} />;
}
