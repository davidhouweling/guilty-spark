import React, { useEffect, useMemo, useSyncExternalStore, useRef } from "react";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";
import type { LiveTrackerMessage } from "@guilty-spark/contracts/live-tracker/types";
import { installServices } from "../../services/install";
import type { Services } from "../../services/types";
import { ComponentLoader, ComponentLoaderStatus } from "../component-loader/component-loader";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import { LiveTrackerPresenter } from "./live-tracker-presenter";
import { LiveTrackerStore } from "./live-tracker-store";
import { LiveTrackerView } from "./live-tracker";
import type { LiveTrackerViewModel } from "./types";

interface LiveTrackerAppProps {
  readonly apiHost: string;
}

interface LiveTrackerFactoryProps {
  readonly services: Services;
}

TimeAgo.addDefaultLocale(en);

// Helper function to deeply compare state messages
function isStateMessageEqual(prev: LiveTrackerMessage | null, curr: LiveTrackerMessage | null): boolean {
  if (prev === curr) {
    return true;
  }

  if (prev === null || curr === null) {
    return false;
  }

  if (prev.type !== curr.type) {
    return false;
  }

  // For state messages, serialize and compare the data
  // This is more reliable than manual deep comparison
  try {
    return JSON.stringify(prev) === JSON.stringify(curr);
  } catch {
    // If serialization fails, assume they're different
    return false;
  }
}

export function LiveTrackerFactory({ services }: LiveTrackerFactoryProps): React.ReactElement {
  const store = useMemo(() => new LiveTrackerStore(), []);

  const presenter = useMemo(() => {
    return new LiveTrackerPresenter({
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

  const loaderStatus =
    snapshot.connectionState === "error"
      ? ComponentLoaderStatus.ERROR
      : snapshot.hasReceivedInitialData
        ? ComponentLoaderStatus.LOADED
        : ComponentLoaderStatus.LOADING;

  // Memoize model creation to prevent unnecessary re-renders when WebSocket
  // sends identical data (e.g., heartbeat messages every 3 minutes)
  const modelRef = useRef<LiveTrackerViewModel | null>(null);
  const snapshotRef = useRef<typeof snapshot | null>(null);

  const model = useMemo((): LiveTrackerViewModel => {
    // If this is the first render, create the model
    if (modelRef.current === null || snapshotRef.current === null) {
      const newModel = LiveTrackerPresenter.present(snapshot);
      modelRef.current = newModel;
      snapshotRef.current = snapshot;
      return newModel;
    }

    const prev = snapshotRef.current;
    const curr = snapshot;

    // Quick reference equality check
    if (prev === curr) {
      return modelRef.current;
    }

    // Check if any meaningful data has changed
    const hasChanged =
      prev.connectionState !== curr.connectionState ||
      prev.statusText !== curr.statusText ||
      prev.params.server !== curr.params.server ||
      prev.params.queue !== curr.params.queue ||
      prev.hasConnection !== curr.hasConnection ||
      prev.hasReceivedInitialData !== curr.hasReceivedInitialData ||
      // Deep check the state message data
      !isStateMessageEqual(prev.lastStateMessage, curr.lastStateMessage);

    if (!hasChanged) {
      // Data is the same, return the previous model to prevent re-renders
      return modelRef.current;
    }

    // Data has changed, create a new model
    const newModel = LiveTrackerPresenter.present(snapshot);
    modelRef.current = newModel;
    snapshotRef.current = snapshot;
    return newModel;
  }, [snapshot]);

  return (
    <ComponentLoader
      status={loaderStatus}
      loading={<LoadingState />}
      error={
        <ErrorState
          message={snapshot.statusText}
          onRetry={() => {
            presenter.start();
          }}
        />
      }
      loaded={<LiveTrackerView model={model} />}
    />
  );
}

export function LiveTracker({ apiHost }: LiveTrackerAppProps): React.ReactElement {
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

  const loaded = services ? <LiveTrackerFactory services={services} /> : <ErrorState />;

  return <ComponentLoader status={loadingServices} loading={<LoadingState />} error={<ErrorState />} loaded={loaded} />;
}
