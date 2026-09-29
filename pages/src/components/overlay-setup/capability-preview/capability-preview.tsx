import { useRef, useState } from "react";
import type { CSSProperties, ReactElement, RefObject } from "react";
import classNames from "classnames";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { Alert } from "../../alert/alert";
import { Button } from "../../button/button";
import { ErrorState } from "../../error-state/error-state";
import { HoverZoom } from "../../hover-zoom/hover-zoom";
import { LoadingState } from "../../loading-state/loading-state";
import { TabbedSection } from "../../tabbed-section/tabbed-section";
import type { TabbedSectionTab } from "../../tabbed-section/types";
import type { CapabilityPreviewTab, CapabilityPreviewViewProps } from "./types";
import { usePreviewScale } from "./use-preview-scale";
import styles from "./capability-preview.module.css";

const PREVIEW_TABS: readonly TabbedSectionTab<CapabilityPreviewTab>[] = [
  { id: "series", label: "Series overlay", content: null },
  { id: "matchmaking", label: "Matchmaking overlay", content: null },
  { id: "viewer", label: "Viewer", content: null },
];

function renderPreviewContent(
  props: CapabilityPreviewViewProps,
  scrollRootRef: RefObject<HTMLDivElement | null>,
  fixedControlsTarget: HTMLElement | null,
): ReactElement {
  const { content, OverlayPage, LiveOverlayPage, ViewerPage, onRetry } = props;
  switch (content.type) {
    case "live-loading": {
      return <LoadingState text="Checking live tracker..." />;
    }
    case "live-error": {
      return <ErrorState message={content.message} onRetry={props.onRetryDirectory} />;
    }
    case "live-empty": {
      return (
        <div className={styles.previewState}>
          <div className={styles.liveEmpty}>
            <p>{content.isPaused ? "Your tracker is paused." : "No live tracker is running."}</p>
            <Button href="/individual-tracker" variant="secondary" size="small">
              Manage trackers
            </Button>
            <p>Manage tracking sessions, series and tracker settings.</p>
          </div>
        </div>
      );
    }
    case "live-overlay": {
      return (
        <LiveOverlayPage
          gamertag={content.gamertag}
          onDirectoryChange={props.onLiveDirectoryChange}
          showPreview
          previewMode={content.previewMode}
        />
      );
    }
    case "loading": {
      return <LoadingState text="Loading preview..." />;
    }
    case "error": {
      return (
        <ErrorState
          message={content.message}
          onRetry={(): void => {
            onRetry(content.mode);
          }}
        />
      );
    }
    case "empty-series": {
      return (
        <div className={styles.previewState}>
          <Alert variant="info">No completed custom series found for this preview.</Alert>
        </div>
      );
    }
    case "overlay": {
      return (
        <OverlayPage
          trackerId={content.trackerId}
          externalView={content.view}
          showPreview
          previewMode={content.previewMode}
        />
      );
    }
    case "viewer": {
      return (
        <ViewerPage
          trackerId={content.trackerId}
          externalView={content.view}
          streamerSettings={content.view.streamerSettings}
          connectionStatusOverride="connected"
          scrollRootRef={scrollRootRef}
          jumpToLatestPortalTarget={fixedControlsTarget}
        />
      );
    }
    default: {
      throw new UnreachableError(content);
    }
  }
}

export function CapabilityPreview(props: CapabilityPreviewViewProps): ReactElement {
  const { activeTab, source, showLiveTab, isZoomEnabled, onTabChange, onZoomEnabledChange, LiveOverlayPage } = props;
  const { containerRef, scale } = usePreviewScale();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [fixedControlsTarget, setFixedControlsTarget] = useState<HTMLDivElement | null>(null);
  const showCanvas = activeTab !== "live" || props.content.type === "live-overlay";
  const liveTab: TabbedSectionTab<CapabilityPreviewTab> = {
    id: "live",
    label: (
      <span>
        <span className={classNames(styles.liveDot, props.isTrackerLive && styles.liveDotActive)} aria-hidden="true" />
        Live overlay
      </span>
    ),
    content: null,
  };

  return (
    <section className={styles.previewRegion} aria-label="Capability preview">
      <div className={styles.previewToolbar}>
        <TabbedSection
          variant="navigation"
          tabs={showLiveTab ? [...PREVIEW_TABS, liveTab] : PREVIEW_TABS}
          selectedTabId={activeTab}
          tabListAriaLabel="Preview capability"
          tabsClassName={styles.previewTabs}
          onTabChange={onTabChange}
        />
      </div>
      <div
        ref={containerRef}
        className={styles.previewFrame}
        style={{ "--preview-scale": String(scale) } as CSSProperties}
      >
        {showLiveTab && !(activeTab === "live" && props.content.type === "live-overlay") ? (
          <div className={styles.liveObserver} aria-hidden="true">
            <LiveOverlayPage gamertag={source.gamertag} onDirectoryChange={props.onLiveDirectoryChange} showPreview />
          </div>
        ) : null}
        {showCanvas ? (
          <button
            type="button"
            className={styles.zoomToggle}
            aria-label="Zoom preview"
            aria-pressed={isZoomEnabled}
            onClick={(): void => {
              onZoomEnabledChange(!isZoomEnabled);
            }}
          >
            {isZoomEnabled ? "Zoom on" : "Zoom off"}
          </button>
        ) : null}
        {showCanvas ? (
          <HoverZoom
            ariaLabel="Preview canvas"
            className={classNames(styles.zoomLayer, isZoomEnabled && styles.zoomLayerActive)}
            enabled={isZoomEnabled}
          >
            <div ref={stageRef} className={styles.stage} data-testid="preview-stage">
              {renderPreviewContent(props, stageRef, fixedControlsTarget)}
            </div>
            <div ref={setFixedControlsTarget} className={styles.fixedControls} data-testid="preview-fixed-controls" />
          </HoverZoom>
        ) : (
          <div className={styles.liveContent}>{renderPreviewContent(props, stageRef, fixedControlsTarget)}</div>
        )}
      </div>
      {showCanvas ? (
        <div className={styles.previewFooter}>
          <span className={styles.sourceLabel}>
            {source.isExample ? <span className={styles.exampleMark}>Example:</span> : null}
            {activeTab === "live" ? "Live session" : source.gamertag}
          </span>
          <p className={styles.previewHint}>Shown to scale from a 1920 × 1080 canvas</p>
        </div>
      ) : null}
      <p className={styles.previewDescription}>
        {activeTab === "live"
          ? "Live shows your current tracking session, starting from when the tracker was last started."
          : "These previews are indicative, based on recent match history. Live sessions begin when a tracker starts."}
      </p>
    </section>
  );
}
