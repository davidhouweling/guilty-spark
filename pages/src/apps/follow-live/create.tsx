import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { FollowLiveOverlayViewerCreate } from "../../components/follow/follow-live-overlay-viewer-create";
import { FollowLiveViewerCreate } from "../../components/follow/follow-live-viewer-create";
import type { Services } from "./services";
import { installServices } from "./services";

interface FollowLiveAppProps {
  readonly apiHost: string;
  readonly gamertag: string;
  readonly variant?: "viewer" | "overlay";
}

export function FollowLiveApp({ apiHost, gamertag, variant = "viewer" }: FollowLiveAppProps): ReactElement {
  const [state, setState] = useState(ComponentLoaderStatus.PENDING);
  const [services, setServices] = useState<Services | null>(null);
  const [overlayPreview, setOverlayPreview] = useState<{ showPreview: boolean; previewMode: "player" | "observer" }>({
    showPreview: false,
    previewMode: "observer",
  });

  useEffect(() => {
    if (variant !== "overlay") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const showPreview = params.get("preview") === "1";
    const previewModeParam = params.get("previewMode");
    const previewMode = previewModeParam === "player" ? "player" : "observer";

    setOverlayPreview({ showPreview, previewMode });
  }, [variant]);

  useEffect(() => {
    if (gamertag === "") {
      return;
    }

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
  }, [apiHost, gamertag]);

  if (gamertag === "") {
    return <ErrorState message="No gamertag provided" />;
  }

  const isOverlay = variant === "overlay";

  return (
    <ComponentLoader
      status={state}
      loading={<LoadingState text={isOverlay ? "Loading overlay..." : "Loading..."} />}
      error={<ErrorState message={isOverlay ? "Failed to load overlay" : "Failed to load viewer"} />}
      loaded={
        services != null ? (
          isOverlay ? (
            <FollowLiveOverlayViewerCreate
              gamertag={gamertag}
              followLiveService={services.followLiveService}
              individualTrackerViewService={services.individualTrackerViewService}
              matchAnalyticsService={services.matchAnalyticsService}
              seriesMatchesService={services.seriesMatchesService}
              haloClient={services.haloClient}
              showPreview={overlayPreview.showPreview}
              previewMode={overlayPreview.previewMode}
            />
          ) : (
            <FollowLiveViewerCreate
              gamertag={gamertag}
              followLiveService={services.followLiveService}
              individualTrackerViewService={services.individualTrackerViewService}
              matchAnalyticsService={services.matchAnalyticsService}
              seriesMatchesService={services.seriesMatchesService}
              haloClient={services.haloClient}
            />
          )
        ) : (
          <ErrorState message="Services failed to load" />
        )
      }
    />
  );
}

// Re-export a named alias for the overlay route so the Astro page import stays
// explicit about what it's rendering.
export { FollowLiveApp as FollowLiveOverlayApp };
