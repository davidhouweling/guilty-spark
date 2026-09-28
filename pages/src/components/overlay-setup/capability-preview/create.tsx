import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactElement } from "react";
import type { CapabilityPreviewConfig, CapabilityPreviewOptions } from "./types";
import { CapabilityPreviewPresenter } from "./capability-preview-presenter";
import { CapabilityPreview } from "./capability-preview";
import { CapabilityPreviewStore } from "./capability-preview-store";

export type CapabilityPreviewSectionProps = CapabilityPreviewOptions;

export function createCapabilityPreview(
  config: CapabilityPreviewConfig,
): (props: CapabilityPreviewOptions) => ReactElement {
  const Component = (props: CapabilityPreviewOptions): ReactElement => {
    const store = useMemo(() => new CapabilityPreviewStore(), []);
    const presenter = useMemo(
      () => new CapabilityPreviewPresenter({ previewService: config.previewService, store }),
      [config.previewService, store],
    );
    useEffect(() => {
      presenter.reload(props.streamerSettings);
      return (): void => {
        presenter.dispose();
      };
    }, [presenter, props.streamerSettings]);

    const snapshot = useSyncExternalStore(presenter.subscribe, presenter.getSnapshot, presenter.getSnapshot);
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

    return (
      <CapabilityPreview
        {...viewModel}
        OverlayPage={config.OverlayPage}
        ViewerPage={config.ViewerPage}
        onRetry={(mode): void => {
          presenter.load(mode, props.streamerSettings);
        }}
        onTabChange={(tab): void => {
          presenter.selectTab(tab);
        }}
      />
    );
  };

  return Component;
}
