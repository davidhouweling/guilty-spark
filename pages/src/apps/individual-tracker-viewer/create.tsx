import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { IndividualTrackerViewerPage } from "../../components/individual-tracker/viewer/create";
import type { Services } from "./services";
import { installServices } from "./services";

TimeAgo.addDefaultLocale(en);

interface IndividualTrackerViewerAppProps {
  readonly apiHost: string;
  readonly trackerId: string;
}

function redirectToLogin(): void {
  const loginUrl = new URL("/login", window.location.origin);
  loginUrl.searchParams.set("redirect", window.location.pathname);
  window.location.assign(loginUrl.toString());
}

export function IndividualTrackerViewerApp({ apiHost, trackerId }: IndividualTrackerViewerAppProps): ReactElement {
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
        const session = await installedServices.authService.getSession();
        if (isCancelled) {
          return;
        }

        if (!session.authenticated) {
          redirectToLogin();
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
    return <ErrorState message="Tracker page has not been opened with a valid tracker id" />;
  }

  return (
    <ComponentLoader
      status={state}
      loading={<LoadingState text="Checking current session..." />}
      error={<ErrorState message="Failed to load tracker" />}
      loaded={
        services ? (
          <IndividualTrackerViewerPage
            individualTrackerService={services.individualTrackerService}
            individualTrackerViewService={services.individualTrackerViewService}
            matchAnalyticsService={services.matchAnalyticsService}
            seriesMatchesService={services.seriesMatchesService}
            haloClient={services.haloClient}
            trackerId={trackerId}
            pageTitleVariant="tracker"
          />
        ) : (
          <ErrorState message="Services failed to load" />
        )
      }
    />
  );
}
