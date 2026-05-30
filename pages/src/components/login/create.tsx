import React, { useCallback, useEffect, useState } from "react";
import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { safeRedirectPath } from "@guilty-spark/shared/base/safe-redirect";
import { authStartQuerySchema } from "@guilty-spark/shared/contracts/auth/microsoft/start";
import { ComponentLoader, ComponentLoaderStatus } from "../component-loader/component-loader";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import type { AuthService } from "../../services/auth/types";
import { Login } from "./login";
import styles from "./login.module.css";

interface LoginPageProps {
  readonly authService: AuthService;
  readonly apiHost: string;
}

function getRedirectPathFromUrl(): string {
  const url = new URL(window.location.href);
  const parseQueryParamsResult = parseQueryParams(url, authStartQuerySchema, "Invalid query parameters");
  if (!parseQueryParamsResult.success) {
    return "/";
  }

  const path = safeRedirectPath(parseQueryParamsResult.data.redirect, window.location.origin);
  return path.split(/[?#]/)[0] === "/login" ? "/" : path;
}

function buildSignInHref(apiHost: string): string {
  const startUrl = new URL("/auth/microsoft/start", apiHost);
  startUrl.searchParams.set("redirect", getRedirectPathFromUrl());
  return startUrl.toString();
}

export function LoginPage({ authService, apiHost }: LoginPageProps): React.ReactElement {
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

  return (
    <div className={styles.container}>
      <ComponentLoader
        status={state}
        loading={<LoadingState text="Checking current session..." />}
        error={<ErrorState message={errorMessage ?? "Failed to load login page"} onRetry={() => void checkSession()} />}
        loaded={<Login signInHref={buildSignInHref(apiHost)} />}
      />
    </div>
  );
}
