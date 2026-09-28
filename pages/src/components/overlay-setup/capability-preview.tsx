import type { ReactElement } from "react";
import { useState } from "react";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { Alert } from "../alert/alert";
import { LoadingState } from "../loading-state/loading-state";
import { TabbedSection } from "../tabbed-section/tabbed-section";
import type { TabbedSectionTab } from "../tabbed-section/types";
import type { IndividualTrackerOverlayPageProps } from "../individual-tracker/overlay/create";
import type { IndividualTrackerViewerPageProps } from "../individual-tracker/viewer/create";
import type { CapabilityPreviewModeSnapshot } from "./capability-preview-store";
import { OVERLAY_DESIGN_HEIGHT, OVERLAY_DESIGN_WIDTH, usePreviewScale } from "./use-preview-scale";
import styles from "./capability-preview.module.css";

type PreviewTab = "matchmaking" | "series" | "viewer";

export interface CapabilityPreviewProps {
  readonly gamertag: string | null;
  readonly isAuthenticated: boolean;
  readonly previewMode: "player" | "observer";
  readonly streamerSettings: StreamerViewSettings | undefined;
  readonly matchmaking: CapabilityPreviewModeSnapshot;
  readonly series: CapabilityPreviewModeSnapshot;
  readonly OverlayPage: (props: IndividualTrackerOverlayPageProps) => ReactElement;
  readonly ViewerPage: (props: IndividualTrackerViewerPageProps) => ReactElement;
  readonly onRetry: (mode: PreviewTab) => void;
}

const PREVIEW_TABS: readonly TabbedSectionTab<PreviewTab>[] = [
  { id: "matchmaking", label: "Matchmaking overlay", content: null },
  { id: "series", label: "Series overlay", content: null },
  { id: "viewer", label: "Viewer", content: null },
];

interface OverlayModeContentProps {
  readonly state: CapabilityPreviewModeSnapshot;
  readonly mode: "matchmaking" | "series";
  readonly previewMode: "player" | "observer";
  readonly streamerSettings: StreamerViewSettings | undefined;
  readonly OverlayPage: (props: IndividualTrackerOverlayPageProps) => ReactElement;
  readonly onRetry: () => void;
}

function OverlayModeContent({
  state,
  mode,
  previewMode,
  streamerSettings,
  OverlayPage,
  onRetry,
}: OverlayModeContentProps): ReactElement {
  if (state.status === "idle" || state.status === "loading") {
    return <LoadingState text="Loading preview..." />;
  }
  if (state.status === "error") {
    return (
      <div className={styles.previewState}>
        <div>
          <Alert variant="error">{state.errorMessage}</Alert>
          <button type="button" onClick={onRetry}>
            Retry preview
          </button>
        </div>
      </div>
    );
  }

  const { view } = state.data;
  if (mode === "series" && (!view.hasActiveSeries || view.series.length === 0)) {
    return (
      <div className={styles.previewState}>
        <Alert variant="info">No completed custom series found for this preview.</Alert>
      </div>
    );
  }

  const previewView = { ...view, streamerSettings };
  return <OverlayPage trackerId={view.trackerId} externalView={previewView} showPreview previewMode={previewMode} />;
}

export function CapabilityPreview({
  gamertag,
  isAuthenticated,
  previewMode,
  streamerSettings,
  matchmaking,
  series,
  OverlayPage,
  ViewerPage,
  onRetry,
}: CapabilityPreviewProps): ReactElement {
  const [activeTab, setActiveTab] = useState<PreviewTab>("matchmaking");
  const { containerRef, scale } = usePreviewScale();
  const sourceState = activeTab === "series" ? series : matchmaking;
  const isExample = sourceState.status === "loaded" ? sourceState.data.isExample : !isAuthenticated;
  const previewGamertag = sourceState.status === "loaded" ? sourceState.data.view.gamertag : (gamertag ?? "soundmanD");

  let content: ReactElement;
  switch (activeTab) {
    case "matchmaking": {
      content = (
        <OverlayModeContent
          state={matchmaking}
          mode="matchmaking"
          previewMode={previewMode}
          streamerSettings={streamerSettings}
          OverlayPage={OverlayPage}
          onRetry={(): void => {
            onRetry("matchmaking");
          }}
        />
      );
      break;
    }
    case "series": {
      content = (
        <OverlayModeContent
          state={series}
          mode="series"
          previewMode={previewMode}
          streamerSettings={streamerSettings}
          OverlayPage={OverlayPage}
          onRetry={(): void => {
            onRetry("series");
          }}
        />
      );
      break;
    }
    case "viewer": {
      if (matchmaking.status === "idle" || matchmaking.status === "loading") {
        content = <LoadingState text="Loading preview..." />;
        break;
      }
      if (matchmaking.status === "error") {
        content = (
          <div className={styles.previewState}>
            <div>
              <Alert variant="error">{matchmaking.errorMessage}</Alert>
              <button
                type="button"
                onClick={(): void => {
                  onRetry("matchmaking");
                }}
              >
                Retry preview
              </button>
            </div>
          </div>
        );
        break;
      }
      content = (
        <ViewerPage
          trackerId={matchmaking.data.view.trackerId}
          externalView={{ ...matchmaking.data.view, streamerSettings }}
          streamerSettings={streamerSettings}
          connectionStatusOverride="connected"
        />
      );
      break;
    }
    default: {
      throw new UnreachableError(activeTab);
    }
  }

  return (
    <section className={styles.previewRegion} aria-label="Capability preview">
      <div className={styles.previewToolbar}>
        <TabbedSection
          variant="navigation"
          tabs={PREVIEW_TABS}
          selectedTabId={activeTab}
          tabListAriaLabel="Preview capability"
          tabsClassName={styles.previewTabs}
          onTabChange={setActiveTab}
        />
        <span className={styles.sourceLabel}>
          {isExample ? <span className={styles.exampleMark}>Example:</span> : null}
          {previewGamertag}
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
          {content}
        </div>
      </div>
      <p className={styles.previewHint}>Shown to scale from a 1920 × 1080 canvas</p>
    </section>
  );
}
