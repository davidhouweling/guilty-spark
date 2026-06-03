import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import classNames from "classnames";
import type { TeamColor } from "../team-colors/team-colors";
import type { TickerMatchGroup } from "../information-ticker/information-ticker";
import { BottomSection } from "./bottom-section";
import { OverlayStatsPanel } from "./overlay-stats-panel";
import styles from "./streamer-overlay.module.css";

export interface StreamerOverlayProps {
  readonly topSection: React.ReactNode;
  readonly pinTopSection?: boolean;
  readonly teamColors: TeamColor[];
  readonly tabsBarSlot: React.ReactNode;
  readonly tickerMatchGroups: readonly TickerMatchGroup[];
  readonly showTabs: boolean;
  readonly showTicker: boolean;
  readonly showPreSeriesInfo: boolean;
  readonly matchesLength: number;
  readonly showPreview: boolean;
  readonly previewMode: "player" | "observer";
  readonly fontSizeStyles: React.CSSProperties;
  readonly settingsUi: React.ReactNode;
  readonly panelOpen?: boolean;
  readonly renderPanelContent: () => React.ReactElement | null;
  readonly onClosePanel?: () => void;
}

export function StreamerOverlay({
  topSection,
  pinTopSection = false,
  teamColors,
  tabsBarSlot,
  tickerMatchGroups,
  showTabs,
  showTicker,
  showPreSeriesInfo,
  matchesLength,
  showPreview,
  previewMode,
  fontSizeStyles,
  settingsUi,
  panelOpen,
  renderPanelContent,
  onClosePanel,
}: StreamerOverlayProps): React.ReactElement {
  const [internalIsPanelOpen, setInternalIsPanelOpen] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [previousMatchCount, setPreviousMatchCount] = useState(0);
  const nodeRef = useRef<HTMLDivElement | null>(null);

  const isPanelOpen = panelOpen ?? internalIsPanelOpen;

  const handleScrollComplete = (): void => {
    if (tickerMatchGroups.length === 0) {
      return;
    }

    setCurrentMatchIndex((prevIndex) => (prevIndex + 1) % tickerMatchGroups.length);
  };

  useEffect(() => {
    if (currentMatchIndex < tickerMatchGroups.length) {
      return;
    }

    setCurrentMatchIndex(0);
  }, [currentMatchIndex, tickerMatchGroups.length]);

  useEffect(() => {
    if (!showTicker) {
      return;
    }

    const currentMatchCount = matchesLength;

    if (currentMatchCount > previousMatchCount && previousMatchCount > 0) {
      const latestMatchIndex = tickerMatchGroups.findIndex((group) => group.matchIndex === currentMatchCount - 1);
      if (latestMatchIndex !== -1) {
        setCurrentMatchIndex(latestMatchIndex);
      }
    }

    setPreviousMatchCount(currentMatchCount);
  }, [matchesLength, showTicker, tickerMatchGroups, previousMatchCount]);

  const handleClosePanel = useCallback((): void => {
    if (onClosePanel !== undefined) {
      onClosePanel();
    } else {
      setInternalIsPanelOpen(false);
    }
  }, [onClosePanel]);

  const hasTickerGroups = tickerMatchGroups.length > 0;
  const currentMatchGroup = hasTickerGroups
    ? tickerMatchGroups[currentMatchIndex % tickerMatchGroups.length]
    : undefined;
  const panelContent = useMemo<React.ReactElement | null>(() => renderPanelContent(), [renderPanelContent]);

  return (
    <div
      className={classNames(styles.overlay, {
        [styles.previewPlayer]: showPreview && previewMode === "player",
        [styles.previewObserver]: showPreview && previewMode === "observer",
      })}
      style={fontSizeStyles}
    >
      {settingsUi}

      <div className={classNames({ [styles.topSectionPinnedWrapper]: pinTopSection })}>{topSection}</div>

      <BottomSection
        showTabs={showTabs}
        showTicker={showTicker}
        showPreSeriesInfo={showPreSeriesInfo}
        matchesLength={matchesLength}
        currentMatchGroup={currentMatchGroup}
        teamColors={teamColors}
        tabsBarSlot={tabsBarSlot}
        onScrollComplete={handleScrollComplete}
      />

      <OverlayStatsPanel
        isPanelOpen={isPanelOpen}
        nodeRef={nodeRef}
        onClosePanel={handleClosePanel}
        panelContent={panelContent}
      />
    </div>
  );
}
