import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import type { CapabilityPreviewOptions, CapabilityPreviewPageComponents, CapabilityPreviewTab } from "./types";
import type { CapabilityPreviewPresenter } from "./capability-preview-presenter";
import { CapabilityPreview } from "./capability-preview";

export interface CapabilityPreviewSectionProps extends CapabilityPreviewOptions {
  readonly presenter: CapabilityPreviewPresenter;
  readonly identityKey: string;
  readonly settingsReady: boolean;
  readonly onActivateMode: (tab: CapabilityPreviewTab) => void;
  readonly onRetry: (mode: "matchmaking" | "series") => void;
}

export function createCapabilityPreview(
  config: CapabilityPreviewPageComponents,
): (props: Omit<CapabilityPreviewSectionProps, keyof CapabilityPreviewPageComponents>) => ReactElement {
  const Component = (
    props: Omit<CapabilityPreviewSectionProps, keyof CapabilityPreviewPageComponents>,
  ): ReactElement => {
    const { presenter } = props;
    const [isZoomEnabled, setZoomEnabled] = useState(false);
    const snapshot = useSyncExternalStore(presenter.subscribe, presenter.getSnapshot, presenter.getSnapshot);
    useEffect(() => {
      if (!props.settingsReady) {
        return;
      }
      presenter.updateSettings(props.streamerSettings, props.identityKey);
    }, [presenter, props.identityKey, props.settingsReady, props.streamerSettings]);
    useEffect(() => {
      if (props.settingsReady) {
        props.onActivateMode(snapshot.activeTab);
      }
    }, [props.onActivateMode, props.settingsReady, snapshot.activeTab]);
    const viewModel = useMemo(
      () =>
        presenter.present(snapshot, {
          gamertag: props.gamertag,
          isAuthenticated: props.isAuthenticated,
          previewMode: props.previewMode,
          streamerSettings: props.streamerSettings,
        }),
      [props.gamertag, props.isAuthenticated, presenter, props.previewMode, props.streamerSettings, snapshot],
    );
    useEffect(() => {
      presenter.setDirectoryObserverEnabled(viewModel.content.type !== "live-overlay");
    }, [presenter, viewModel.content.type]);

    return (
      <CapabilityPreview
        {...viewModel}
        OverlayPage={config.OverlayPage}
        LiveOverlayPage={config.LiveOverlayPage}
        onLiveDirectoryChange={presenter.onFollowDirectoryChange}
        ViewerPage={config.ViewerPage}
        isZoomEnabled={isZoomEnabled}
        onRetryDirectory={(): void => {
          presenter.retryDirectory();
        }}
        onRetry={props.onRetry}
        onTabChange={(tab): void => {
          presenter.selectTab(tab);
          if (props.settingsReady) {
            props.onActivateMode(tab);
          }
        }}
        onZoomEnabledChange={setZoomEnabled}
      />
    );
  };

  return Component;
}
