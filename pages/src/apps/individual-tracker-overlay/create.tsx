import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { IndividualTrackerOverlayPage } from "../../components/individual-tracker/overlay/create";
import type { Services } from "../individual-tracker-viewer/services";
import { installServices } from "../individual-tracker-viewer/services";

interface IndividualTrackerOverlayAppProps {
  readonly apiHost: string;
  readonly trackerId: string;
}

export function IndividualTrackerOverlayApp({ apiHost, trackerId }: IndividualTrackerOverlayAppProps): ReactElement {
  const [state, setState] = useState(ComponentLoaderStatus.PENDING);
  const [services, setServices] = useState<Services | null>(null);

  useEffect(() => {
    if (trackerId === "") {
      return;
    }

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
  }, [apiHost, trackerId]);

  if (trackerId === "") {
    return <ErrorState message="Overlay page has not been opened with a valid tracker id" />;
  }

  return (
    <ComponentLoader
      status={state}
      loading={<LoadingState text="Loading tracker..." />}
      error={<ErrorState message="Failed to load tracker" />}
      loaded={
        services ? (
          <IndividualTrackerOverlayPage
            individualTrackerViewService={services.individualTrackerViewService}
            matchAnalyticsService={services.matchAnalyticsService}
            seriesMatchesService={services.seriesMatchesService}
            haloClient={services.haloClient}
            trackerId={trackerId}
          />
        ) : (
          <ErrorState message="Services failed to load" />
        )
      }
    />
  );
}
