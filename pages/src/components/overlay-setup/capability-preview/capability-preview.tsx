import type { ReactElement } from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { Alert } from "../../alert/alert";
import { ErrorState } from "../../error-state/error-state";
import { LoadingState } from "../../loading-state/loading-state";
import { TabbedSection } from "../../tabbed-section/tabbed-section";
import type { TabbedSectionTab } from "../../tabbed-section/types";
import type { CapabilityPreviewTab, CapabilityPreviewViewProps } from "./types";
import { OVERLAY_DESIGN_HEIGHT, OVERLAY_DESIGN_WIDTH, usePreviewScale } from "./use-preview-scale";
import styles from "./capability-preview.module.css";

const PREVIEW_TABS: readonly TabbedSectionTab<CapabilityPreviewTab>[] = [
  { id: "matchmaking", label: "Matchmaking overlay", content: null },
  { id: "series", label: "Series overlay", content: null },
  { id: "viewer", label: "Viewer", content: null },
];

function renderPreviewContent(props: CapabilityPreviewViewProps): ReactElement {
  const { content, OverlayPage, ViewerPage, onRetry } = props;
  switch (content.type) {
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
        />
      );
    }
    default: {
      throw new UnreachableError(content);
    }
  }
}

export function CapabilityPreview(props: CapabilityPreviewViewProps): ReactElement {
  const { activeTab, source, onTabChange } = props;
  const { containerRef, scale } = usePreviewScale();

  return (
    <section className={styles.previewRegion} aria-label="Capability preview">
      <div className={styles.previewToolbar}>
        <TabbedSection
          variant="navigation"
          tabs={PREVIEW_TABS}
          selectedTabId={activeTab}
          tabListAriaLabel="Preview capability"
          tabsClassName={styles.previewTabs}
          onTabChange={onTabChange}
        />
        <span className={styles.sourceLabel}>
          {source.isExample ? <span className={styles.exampleMark}>Example:</span> : null}
          {source.gamertag}
        </span>
      </div>
      <div ref={containerRef} className={styles.previewFrame}>
        <div
          className={styles.stage}
          style={{
            width: `${String(OVERLAY_DESIGN_WIDTH)}px`,
            height: `${String(OVERLAY_DESIGN_HEIGHT)}px`,
            transform: `scale(${String(scale)})`,
          }}
        >
          {renderPreviewContent(props)}
        </div>
      </div>
      <p className={styles.previewHint}>Shown to scale from a 1920 × 1080 canvas</p>
    </section>
  );
}
