import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { createOverlaySetupPage } from "../../components/overlay-setup/create";
import type { Services } from "./services";
import { installServices } from "./services";

interface OverlaySetupAppProps {
  readonly apiHost: string;
}

export function OverlaySetupApp({ apiHost }: OverlaySetupAppProps): ReactElement {
  const [state, setState] = useState(ComponentLoaderStatus.PENDING);
  const [services, setServices] = useState<Services | null>(null);
  const OverlaySetupPage = useMemo(
    () =>
      services == null
        ? null
        : createOverlaySetupPage({
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
      loaded={OverlaySetupPage != null ? <OverlaySetupPage /> : <ErrorState message="Services failed to load" />}
    />
  );
}
