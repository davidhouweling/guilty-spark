import React, { useEffect, useMemo } from "react";
import { installServices } from "../../services/install";
import type { Services } from "../../services/types";
import { ComponentLoader, ComponentLoaderStatus } from "../component-loader/component-loader";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import { IndividualTrackerPresenter } from "./individual-tracker-presenter";
import { IndividualTrackerStore } from "./individual-tracker-store";
import { IndividualTrackerView } from "./individual-tracker";

interface IndividualTrackerProps {
  readonly apiHost: string;
}

interface IndividualTrackerFactoryProps {
  readonly services: Services;
}

export function IndividualTrackerFactory({ services }: IndividualTrackerFactoryProps): React.ReactElement {
  const store = useMemo(() => new IndividualTrackerStore(), []);

  const presenter = useMemo(
    () =>
      new IndividualTrackerPresenter({
        services,
        store,
        assignLocation: (url): void => {
          window.location.assign(url);
        },
      }),
    [services, store],
  );

  useEffect(() => {
    presenter.start();

    return (): void => {
      presenter.dispose();
    };
  }, [presenter]);

  return <IndividualTrackerView presenter={presenter} />;
}

export function IndividualTracker({ apiHost }: IndividualTrackerProps): React.ReactElement {
  const [loadingServices, setLoadingServices] = React.useState(ComponentLoaderStatus.PENDING);
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

  if (!services) {
    return <LoadingState text="Loading individual tracker..." />;
  }

  return (
    <ComponentLoader
      status={loadingServices}
      loading={<LoadingState text="Loading individual tracker..." />}
      error={<ErrorState message="Failed to load individual tracker" />}
      loaded={<IndividualTrackerFactory services={services} />}
    />
  );
}
