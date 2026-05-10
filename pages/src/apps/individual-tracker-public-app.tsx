import React, { useEffect, useMemo } from "react";
import TimeAgo from "javascript-time-ago";
import en from "javascript-time-ago/locale/en";
import { ErrorState } from "../components/error-state/error-state";
import { LoadingState } from "../components/loading-state/loading-state";
import { PublicViewer } from "../components/individual-tracker/public-viewer/public-viewer";
import { PublicViewerPresenter } from "../components/individual-tracker/public-viewer/public-viewer-presenter";
import { PublicViewerStore } from "../components/individual-tracker/public-viewer/public-viewer-store";
import type { PublicViewerVariant } from "../components/individual-tracker/public-viewer/types";
import type { Services } from "../services/types";
import { BaseApp } from "./base-app";

TimeAgo.addDefaultLocale(en);

interface IndividualTrackerPublicAppProps {
  readonly apiHost: string;
  readonly xuid: string;
  readonly variant: PublicViewerVariant;
  readonly overlayViewPreview?: boolean;
  readonly overlayPreviewMode?: "player" | "observer" | undefined;
}

interface IndividualTrackerPublicFactoryProps {
  readonly services: Services;
  readonly xuid: string;
  readonly variant: PublicViewerVariant;
  readonly overlayViewPreview?: boolean;
  readonly overlayPreviewMode?: "player" | "observer" | undefined;
}

export function IndividualTrackerPublicFactory({
  services,
  xuid,
  variant,
  overlayViewPreview = false,
  overlayPreviewMode,
}: IndividualTrackerPublicFactoryProps): React.ReactElement {
  const store = useMemo(
    () => new PublicViewerStore(xuid, variant, overlayViewPreview, overlayPreviewMode),
    [overlayPreviewMode, overlayViewPreview, xuid, variant],
  );

  const presenter = useMemo(
    () =>
      new PublicViewerPresenter({
        services,
        store,
        xuid,
        variant,
        forcedOverlayColorMode: overlayPreviewMode,
      }),
    [overlayPreviewMode, services, store, xuid, variant],
  );

  useEffect(() => {
    presenter.start();

    return (): void => {
      presenter.dispose();
    };
  }, [presenter]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const previousMode = document.body.getAttribute("data-view-mode");
    if (variant === "overlay") {
      document.body.setAttribute("data-view-mode", "streamer");
    }

    return (): void => {
      if (variant !== "overlay") {
        return;
      }

      if (previousMode == null || previousMode === "") {
        document.body.removeAttribute("data-view-mode");
        return;
      }

      document.body.setAttribute("data-view-mode", previousMode);
    };
  }, [variant]);

  return <PublicViewer presenter={presenter} />;
}

export function IndividualTrackerPublicApp({
  apiHost,
  xuid,
  variant,
  overlayViewPreview = false,
  overlayPreviewMode,
}: IndividualTrackerPublicAppProps): React.ReactElement {
  return (
    <BaseApp
      apiHost={apiHost}
      loading={<LoadingState text="Loading active tracker view..." />}
      error={<ErrorState message="Failed to load active tracker view" />}
      loaded={(services) => (
        <IndividualTrackerPublicFactory
          services={services}
          xuid={xuid}
          variant={variant}
          overlayViewPreview={overlayViewPreview}
          overlayPreviewMode={overlayPreviewMode}
        />
      )}
    />
  );
}
