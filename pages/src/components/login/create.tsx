import React, { useCallback, useEffect, useState } from "react";
import { ComponentLoader, ComponentLoaderStatus } from "../component-loader/component-loader";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import { installServices } from "../../services/install";
import type { Services } from "../../services/types";
import { Login } from "./login";
import styles from "./login.module.css";

interface LoginPageProps {
  readonly apiHost: string;
}

interface LoginPageFactoryProps {
  readonly services: Services;
}

function getRedirectPathFromUrl(): string {
  const url = new URL(window.location.href);
  const redirect = url.searchParams.get("redirect");

  if (redirect == null || redirect === "") {
    return "/";
  }

  if (!redirect.startsWith("/") || redirect.startsWith("//")) {
    return "/";
  }

  return redirect;
}

export function LoginPageFactory({ services }: LoginPageFactoryProps): React.ReactElement {
  const { authService } = services;
  const [state, setState] = useState(ComponentLoaderStatus.LOADING);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkSession = useCallback(async (): Promise<void> => {
    setState(ComponentLoaderStatus.LOADING);
    setErrorMessage(null);

    try {
      const redirectPath = getRedirectPathFromUrl();
      const session = await authService.getSession();

      if (session.authenticated) {
        window.location.assign(redirectPath);
        return;
      }

      setState(ComponentLoaderStatus.LOADED);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load login page");
      setState(ComponentLoaderStatus.ERROR);
    }
  }, [authService]);

  useEffect(() => {
    void checkSession();
  }, [checkSession]);

  const startSignIn = useCallback(async (): Promise<void> => {
    setErrorMessage(null);

    try {
      const redirectPath = getRedirectPathFromUrl();
      const { authUrl } = await authService.startMicrosoftAuth(redirectPath);
      window.location.assign(authUrl);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to start Microsoft sign-in");
    }
  }, [authService]);

  return (
    <div className={styles.container}>
      <ComponentLoader
        status={state}
        loading={<LoadingState text="Checking current session..." />}
        error={<ErrorState message={errorMessage ?? "Failed to load login page"} onRetry={() => void checkSession()} />}
        loaded={<Login onSignIn={() => void startSignIn()} errorMessage={errorMessage} />}
      />
    </div>
  );
}

export function LoginPage({ apiHost }: LoginPageProps): React.ReactElement {
  const [loadingServices, setLoadingServices] = React.useState(ComponentLoaderStatus.PENDING);
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

  return (
    <ComponentLoader
      status={loadingServices}
      loading={<LoadingState text="Checking current session..." />}
      error={<ErrorState message="Failed to load login page" />}
      loaded={services == null ? <ErrorState message="Failed to load login page" /> : <LoginPageFactory services={services} />}
    />
  );
}
