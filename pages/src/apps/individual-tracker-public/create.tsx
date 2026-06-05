import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { TrackerViewResponse } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { IndividualTrackerViewerPage } from "../../components/individual-tracker/viewer/create";
import { IndividualTrackerOverlayPage } from "../../components/individual-tracker/overlay/create";
import type { IndividualTrackerViewService, TrackerViewConnection } from "../../services/individual-tracker/view-types";
import type { Services } from "./services";
import { installServices } from "./services";

interface IndividualTrackerPublicAppProps {
  readonly apiHost: string;
  readonly xuid: string;
  readonly variant?: "viewer" | "overlay";
}

class XuidViewServiceAdapter implements IndividualTrackerViewService {
  private readonly delegate: IndividualTrackerViewService;

  public constructor(delegate: IndividualTrackerViewService) {
    this.delegate = delegate;
  }

  public async getView(xuid: string): Promise<TrackerViewResponse> {
    return this.delegate.getViewByXuid(xuid);
  }

  public connect(xuid: string): TrackerViewConnection {
    return this.delegate.connectByXuid(xuid);
  }

  public async getViewByXuid(xuid: string): Promise<TrackerViewResponse> {
    return this.delegate.getViewByXuid(xuid);
  }

  public connectByXuid(xuid: string): TrackerViewConnection {
    return this.delegate.connectByXuid(xuid);
  }
}

export function IndividualTrackerPublicApp({
  apiHost,
  xuid,
  variant = "viewer",
}: IndividualTrackerPublicAppProps): ReactElement {
  const [state, setState] = useState(ComponentLoaderStatus.PENDING);
  const [services, setServices] = useState<Services | null>(null);

  useEffect(() => {
    if (xuid === "") {
      return;
    }

    let isCancelled = false;

    setServices(null);
    setState(ComponentLoaderStatus.PENDING);

    installServices(apiHost)
      .then((installedServices) => {
        if (isCancelled) {
          return;
        }
        setServices(installedServices);
        setState(ComponentLoaderStatus.LOADED);
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }
        setState(ComponentLoaderStatus.ERROR);
      });

    return (): void => {
      isCancelled = true;
    };
  }, [apiHost, xuid]);

  const xuidViewService = useMemo(
    () => (services != null ? new XuidViewServiceAdapter(services.individualTrackerViewService) : null),
    [services],
  );

  if (xuid === "") {
    return <ErrorState message="No XUID provided" />;
  }

  const isOverlay = variant === "overlay";

  return (
    <ComponentLoader
      status={state}
      loading={<LoadingState text={isOverlay ? "Loading overlay..." : "Loading..."} />}
      error={<ErrorState message={isOverlay ? "Failed to load overlay" : "Failed to load viewer"} />}
      loaded={
        services != null && xuidViewService != null ? (
          isOverlay ? (
            <IndividualTrackerOverlayPage
              individualTrackerViewService={xuidViewService}
              haloClient={services.haloClient}
              trackerId={xuid}
            />
          ) : (
            <IndividualTrackerViewerPage
              individualTrackerViewService={xuidViewService}
              haloClient={services.haloClient}
              trackerId={xuid}
            />
          )
        ) : (
          <ErrorState message="Services failed to load" />
        )
      }
    />
  );
}

export { IndividualTrackerPublicApp as IndividualTrackerPublicOverlayApp };
