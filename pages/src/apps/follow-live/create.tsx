import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { ComponentLoader, ComponentLoaderStatus } from "../../components/component-loader/component-loader";
import { ErrorState } from "../../components/error-state/error-state";
import { LoadingState } from "../../components/loading-state/loading-state";
import { createFollowLiveOverlay } from "../../components/follow/follow-live-overlay/create";
import { createFollowLiveViewer } from "../../components/follow/follow-live-viewer/create";
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

  const FollowLiveViewer = useMemo(
    () =>
      services == null
        ? null
        : createFollowLiveViewer({
            followLiveService: services.followLiveService,
            individualTrackerViewService: services.individualTrackerViewService,
            matchAnalyticsService: services.matchAnalyticsService,
            seriesMatchesService: services.seriesMatchesService,
            haloClient: services.haloClient,
          }),
    [services],
  );

  const FollowLiveOverlay = useMemo(
    () =>
      services == null
        ? null
        : createFollowLiveOverlay({
            followLiveService: services.followLiveService,
            individualTrackerViewService: services.individualTrackerViewService,
            matchAnalyticsService: services.matchAnalyticsService,
            seriesMatchesService: services.seriesMatchesService,
            haloClient: services.haloClient,
          }),
    [services],
  );

  if (gamertag === "") {
    return <ErrorState message="No gamertag provided" />;
  }

  const isOverlay = variant === "overlay";

  if (services == null || FollowLiveViewer == null || FollowLiveOverlay == null) {
    return (
      <ComponentLoader
        status={state}
        loading={<LoadingState text={isOverlay ? "Loading overlay..." : "Loading..."} />}
        error={<ErrorState message={isOverlay ? "Failed to load overlay" : "Failed to load viewer"} />}
        loaded={<ErrorState message="Services failed to load" />}
      />
    );
  }

  return (
    <ComponentLoader
      status={state}
      loading={<LoadingState text={isOverlay ? "Loading overlay..." : "Loading..."} />}
      error={<ErrorState message={isOverlay ? "Failed to load overlay" : "Failed to load viewer"} />}
      loaded={isOverlay ? <FollowLiveOverlay gamertag={gamertag} showPreview={overlayPreview.showPreview} previewMode={overlayPreview.previewMode} /> : <FollowLiveViewer gamertag={gamertag} />}
    />
  );
}

