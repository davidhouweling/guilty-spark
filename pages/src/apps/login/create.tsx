import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import type { AuthService } from "../../services/auth/types";
import { LoadingState } from "../../components/loading-state/loading-state";
import { createLoginPage } from "../../components/login/create";
import { ErrorState } from "../../components/error-state/error-state";
import { installServices } from "./services";

interface LoginAppProps {
  readonly apiHost: string;
}

export function LoginApp({ apiHost }: LoginAppProps): ReactElement {
  const [loadingServices, setLoadingServices] = useState(ComponentLoaderStatus.PENDING);
  const [authService, setAuthService] = useState<AuthService | null>(null);
  const LoginPage = useMemo(
    () => (authService == null ? null : createLoginPage({ authService, apiHost })),
    [apiHost, authService],
  );

  useEffect(() => {
    let isCancelled = false;

    setAuthService(null);
    setLoadingServices(ComponentLoaderStatus.PENDING);

    async function loadServices(): Promise<void> {
      try {
        const installedServices = await installServices(apiHost);
        if (isCancelled) {
          return;
        }

        setAuthService(installedServices.authService);
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
  }, [apiHost]);

  return (
    <ComponentLoader
      status={loadingServices}
      loading={<LoadingState text="Checking current session..." />}
      error={<ErrorState message="Failed to load login page" />}
      loaded={LoginPage != null ? <LoginPage /> : <ErrorState message="Services failed to load" />}
    />
  );
}
