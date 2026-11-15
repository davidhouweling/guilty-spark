import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { createMatchHistoryViewerPage } from "../../components/match-history-viewer/create";
import "../../services/time-ago";
import type { Services } from "./services";
import { installServices } from "./services";

interface MatchHistoryViewerAppProps {
  readonly apiHost: string;
  readonly gamertag: string;
}

function redirectToLogin(): void {
  const loginUrl = new URL("/login", window.location.origin);
  loginUrl.searchParams.set("redirect", window.location.pathname);
  window.location.assign(loginUrl.toString());
}

export function MatchHistoryViewerApp({ apiHost, gamertag }: MatchHistoryViewerAppProps): ReactElement {
  const [state, setState] = useState(ComponentLoaderStatus.PENDING);
  const [services, setServices] = useState<Services | null>(null);
  const MatchHistoryViewerPage = useMemo(
    () =>
      services == null
        ? null
        : createMatchHistoryViewerPage({
            individualTrackerService: services.individualTrackerService,
            individualTrackerSettingsService: services.individualTrackerSettingsService,
            matchAnalyticsService: services.matchAnalyticsService,
            seriesMatchesService: services.seriesMatchesService,
            medalMetadataResolver: services.medalMetadataResolver,
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
  }, [apiHost]);

  return (
    <ComponentLoader
      status={state}
      loading={<LoadingState text="Checking current session..." />}
      error={<ErrorState message="Failed to load match history" />}
      loaded={
        MatchHistoryViewerPage != null ? (
          <MatchHistoryViewerPage gamertag={gamertag} />
        ) : (
          <ErrorState message="Services failed to load" />
        )
      }
    />
  );
}
