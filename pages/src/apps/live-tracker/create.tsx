import React, { useEffect } from "react";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { LiveTracker } from "../../components/live-tracker/create";
import type { Services } from "./services";
import { installServices } from "./services";

TimeAgo.addDefaultLocale(en);

interface LiveTrackerAppProps {
  readonly apiHost: string;
}

export function LiveTrackerApp({ apiHost }: LiveTrackerAppProps): React.ReactElement {
  const [loadingServices, setLoadingServices] = React.useState(ComponentLoaderStatus.PENDING);
  const [services, setServices] = React.useState<Services | null>(null);
  const [shouldConnectToTracker, setShouldConnectToTracker] = React.useState(false);
  const [invalidParams, setInvalidParams] = React.useState(false);

  // Check URL params to determine if we need to connect to a tracker
  // Use useEffect to avoid hydration mismatch (server has no window)
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    const server = url.searchParams.get("server");
    const queue = url.searchParams.get("queue");

    // Team mode: needs both server and queue
    if (server !== null && server.length > 0 && queue !== null && queue.length > 0) {
      setShouldConnectToTracker(true);
    } else {
      setInvalidParams(true);
    }
  }, []);

  // Load services when we have tracker params
  useEffect(() => {
    if (!shouldConnectToTracker) {
      return;
    }

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
  }, [apiHost, shouldConnectToTracker]);

  if (invalidParams) {
    return <ErrorState message="Tracker page has not been opened from a valid URL" />;
  }

  return (
    <ComponentLoader
      status={loadingServices}
      loading={<LoadingState />}
      error={<ErrorState />}
      loaded={
        services ? (
          <LiveTracker liveTrackerService={services.liveTrackerService} />
        ) : (
          <ErrorState message="Services failed to load" />
        )
      }
    />
  );
}
