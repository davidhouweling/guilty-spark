import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { createIndividualTrackerManagerPage } from "../../components/individual-tracker-manager/create";
import type { Services } from "./services";
import { installServices } from "./services";

interface IndividualTrackerManagerAppProps {
  readonly apiHost: string;
}

export function IndividualTrackerManagerApp({ apiHost }: IndividualTrackerManagerAppProps): ReactElement {
  const [state, setState] = useState(ComponentLoaderStatus.PENDING);
  const [services, setServices] = useState<Services | null>(null);
  const IndividualTrackerManagerPage = useMemo(
    () =>
      services == null
        ? null
        : createIndividualTrackerManagerPage({
            authService: services.authService,
            individualTrackerService: services.individualTrackerService,
            settingsService: services.settingsService,
            individualTrackerViewService: services.individualTrackerViewService,
          }),
    [services],
  );

  useEffect(() => {
    let isCancelled = false;

    setServices(null);
    setState(ComponentLoaderStatus.PENDING);

    async function loadServices(): Promise<void> {
      try {
        const installedServices = await installServices(apiHost);
        if (isCancelled) {
          return;
        }
        setServices(installedServices);
        setState(ComponentLoaderStatus.LOADED);
      } catch {
        if (isCancelled) {
          return;
        }
        setState(ComponentLoaderStatus.ERROR);
      }
    }

    void loadServices();

    return (): void => {
      isCancelled = true;
    };
  }, [apiHost]);

  return (
    <ComponentLoader
      status={state}
      loading={<LoadingState text="Loading tracker manager..." />}
      error={<ErrorState message="Failed to load tracker manager" />}
      loaded={
        IndividualTrackerManagerPage != null ? (
          <IndividualTrackerManagerPage />
        ) : (
          <ErrorState message="Services failed to load" />
        )
      }
    />
  );
}
