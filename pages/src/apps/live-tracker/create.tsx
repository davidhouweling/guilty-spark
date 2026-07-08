import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { createLiveTracker } from "../../components/live-tracker/create";
import type { Services } from "./services";
import { installServices } from "./services";

TimeAgo.addDefaultLocale(en);

interface LiveTrackerAppProps {
  readonly apiHost: string;
}

export function LiveTrackerApp({ apiHost }: LiveTrackerAppProps): ReactElement {
  const [loadingServices, setLoadingServices] = useState(ComponentLoaderStatus.PENDING);
  const [services, setServices] = useState<Services | null>(null);
  const [shouldConnectToTracker, setShouldConnectToTracker] = useState(false);
  const [invalidParams, setInvalidParams] = useState(false);
  const LiveTracker = useMemo(
    () =>
      services == null
        ? null
        : createLiveTracker({
            liveTrackerService: services.liveTrackerService,
            matchAnalyticsService: services.matchAnalyticsService,
          }),
    [services],
  );

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

    async function loadServices(): Promise<void> {
      try {
        const installedServices = await installServices(apiHost);
        if (isCancelled) {
          return;
        }

        setServices(installedServices);
        setLoadingServices(ComponentLoaderStatus.LOADED);
      } catch {
        if (isCancelled) {
          return;
        }
        setLoadingServices(ComponentLoaderStatus.ERROR);
      }
    }

    void loadServices();

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
      loaded={LiveTracker != null ? <LiveTracker /> : <ErrorState message="Services failed to load" />}
    />
  );
}
