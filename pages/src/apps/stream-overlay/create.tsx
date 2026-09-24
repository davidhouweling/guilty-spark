import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { createStreamOverlayPage } from "../../components/stream-overlay/create";
import type { Services } from "./services";
import { installServices } from "./services";

interface StreamOverlayAppProps {
  readonly apiHost: string;
}

export function StreamOverlayApp({ apiHost }: StreamOverlayAppProps): ReactElement {
  const [state, setState] = useState(ComponentLoaderStatus.PENDING);
  const [services, setServices] = useState<Services | null>(null);
  const StreamOverlayPage = useMemo(
    () =>
      services == null
        ? null
        : createStreamOverlayPage({
            authService: services.authService,
            settingsService: services.settingsService,
            apiHost,
          }),
    [services, apiHost],
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
      loading={<LoadingState text="Loading stream overlay setup..." />}
      error={<ErrorState message="Failed to load stream overlay setup" />}
      loaded={StreamOverlayPage != null ? <StreamOverlayPage /> : <ErrorState message="Services failed to load" />}
    />
  );
}
