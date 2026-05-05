import React, { useEffect, useMemo } from "react";
import { ErrorState } from "../components/error-state/error-state";
import { LoadingState } from "../components/loading-state/loading-state";
import { PublicViewer } from "../components/individual-tracker/public-viewer/public-viewer";
import { PublicViewerPresenter } from "../components/individual-tracker/public-viewer/public-viewer-presenter";
import { PublicViewerStore } from "../components/individual-tracker/public-viewer/public-viewer-store";
import type { PublicViewerVariant } from "../components/individual-tracker/public-viewer/types";
import type { Services } from "../services/types";
import { BaseApp } from "./base-app";

interface IndividualTrackerPublicAppProps {
  readonly apiHost: string;
  readonly xuid: string;
  readonly variant: PublicViewerVariant;
}

interface IndividualTrackerPublicFactoryProps {
  readonly services: Services;
  readonly xuid: string;
  readonly variant: PublicViewerVariant;
}

export function IndividualTrackerPublicFactory({
  services,
  xuid,
  variant,
}: IndividualTrackerPublicFactoryProps): React.ReactElement {
  const store = useMemo(() => new PublicViewerStore(xuid, variant), [xuid, variant]);

  const presenter = useMemo(
    () =>
      new PublicViewerPresenter({
        services,
        store,
        xuid,
        variant,
      }),
    [services, store, xuid, variant],
  );

  useEffect(() => {
    presenter.start();

    return (): void => {
      presenter.dispose();
    };
  }, [presenter]);

  return <PublicViewer presenter={presenter} />;
}

export function IndividualTrackerPublicApp({
  apiHost,
  xuid,
  variant,
}: IndividualTrackerPublicAppProps): React.ReactElement {
  return (
    <BaseApp
      apiHost={apiHost}
      loading={<LoadingState text="Loading active tracker view..." />}
      error={<ErrorState message="Failed to load active tracker view" />}
      loaded={(services) => <IndividualTrackerPublicFactory services={services} xuid={xuid} variant={variant} />}
    />
  );
}
