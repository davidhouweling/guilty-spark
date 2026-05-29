import React, { useCallback, useEffect, useState } from "react";
import { parseQueryParams } from "@guilty-spark/shared/base/request-parsing";
import { z } from "zod";
import { ComponentLoader, ComponentLoaderStatus } from "../component-loader/component-loader";
import { ErrorState } from "../error-state/error-state";
import { LoadingState } from "../loading-state/loading-state";
import type { AuthService } from "../../services/auth/types";
import { Login } from "./login";
import styles from "./login.module.css";

const searchParamsSchema = z.object({
  redirect: z.string().optional(),
});

interface LoginPageProps {
  readonly authService: AuthService;
}

function getRedirectPathFromUrl(): string {
  const url = new URL(window.location.href);
  const parseQueryParamsResult = parseQueryParams(url, searchParamsSchema, "Invalid query parameters");
  if (!parseQueryParamsResult.success) {
    return "/";
  }

  const { redirect } = parseQueryParamsResult.data;
  if (redirect == null || redirect === "" || !redirect.startsWith("/") || redirect.startsWith("//")) {
    return "/";
  }

  return redirect;
}

export function LoginPage({ authService }: LoginPageProps): React.ReactElement {
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
