import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { IndividualTrackerManagerPage } from "../../components/individual-tracker-manager/create";
import type { Services } from "./services";
import { installServices } from "./services";

interface IndividualTrackerManagerAppProps {
  readonly apiHost: string;
}

function redirectToLogin(): void {
  const loginUrl = new URL("/login", window.location.origin);
  loginUrl.searchParams.set("redirect", window.location.pathname);
  window.location.assign(loginUrl.toString());
}

export function IndividualTrackerManagerApp({ apiHost }: IndividualTrackerManagerAppProps): ReactElement {
  const [state, setState] = useState(ComponentLoaderStatus.PENDING);
  const [services, setServices] = useState<Services | null>(null);

  useEffect(() => {
    let isCancelled = false;

    setServices(null);
    setState(ComponentLoaderStatus.PENDING);

    installServices(apiHost)
      .then(async (installedServices) => {
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
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }
        setState(ComponentLoaderStatus.ERROR);
      });

    return (): void => {
      isCancelled = true;
    };
  }, [apiHost]);

  return (
    <ComponentLoader
      status={state}
      loading={<LoadingState text="Checking current session..." />}
      error={<ErrorState message="Failed to load trackers" />}
      loaded={
        services ? (
          <IndividualTrackerManagerPage individualTrackerService={services.individualTrackerService} />
        ) : (
          <ErrorState message="Services failed to load" />
        )
      }
    />
  );
}
