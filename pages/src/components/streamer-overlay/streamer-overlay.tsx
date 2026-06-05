import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import classNames from "classnames";
import type { TeamColor } from "../team-colors/team-colors";
import type { TickerMatchGroup } from "../information-ticker/information-ticker";
import type { OverlayTab } from "./tabs-bar";
import { BottomSection } from "./bottom-section";
import { StatsPanel } from "./stats-panel";
import styles from "./streamer-overlay.module.css";

export interface StreamerOverlayProps {
  readonly topSection: React.ReactNode;
  readonly pinTopSection?: boolean;
  readonly teamColors: TeamColor[];
  readonly tabs: readonly OverlayTab[];
  readonly tickerMatchGroups: readonly TickerMatchGroup[];
  readonly showTabs: boolean;
  readonly showTicker: boolean;
  readonly showPreSeriesInfo: boolean;
  readonly matchesLength: number;
  readonly showPreview: boolean;
  readonly previewMode: "player" | "observer";
  readonly fontSizeStyles: React.CSSProperties;
  readonly settingsUi: React.ReactNode;
  readonly hasPanelContent: (tabIndex: number) => boolean;
  readonly renderPanelContent: (tabIndex: number) => React.ReactElement | null;
  // Optional external overrides — used when panel state is driven by props rather than tab clicks.
  readonly panelOpen?: boolean;
  readonly onClosePanel?: () => void;
}

export function StreamerOverlay({
  topSection,
  pinTopSection = false,
  teamColors,
  tabs,
  tickerMatchGroups,
  showTabs,
  showTicker,
  showPreSeriesInfo,
  matchesLength,
  showPreview,
  previewMode,
  fontSizeStyles,
  settingsUi,
  hasPanelContent,
  renderPanelContent,
  panelOpen,
  onClosePanel,
}: StreamerOverlayProps): React.ReactElement {
  const [selectedTab, setSelectedTab] = useState(-1); // -1 = series, 0+ = match index
  const [internalIsPanelOpen, setInternalIsPanelOpen] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [previousMatchCount, setPreviousMatchCount] = useState(0);
  const nodeRef = useRef<HTMLDivElement>(null);

  const isPanelOpen = panelOpen !== undefined ? panelOpen : internalIsPanelOpen;

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

  const handleTabClick = useCallback(
    (tabIndex: number): void => {
      if (!hasPanelContent(tabIndex)) {
        return;
      }

      const openPanel = selectedTab === tabIndex ? !internalIsPanelOpen : true;
      setSelectedTab(tabIndex);
      setInternalIsPanelOpen(openPanel);
    },
    [hasPanelContent, internalIsPanelOpen, selectedTab],
  );

  const handleClosePanel = useCallback((): void => {
    setInternalIsPanelOpen(false);
    onClosePanel?.();
  }, [onClosePanel]);

  const hasTickerGroups = tickerMatchGroups.length > 0;
  const currentMatchGroup = hasTickerGroups
    ? tickerMatchGroups[currentMatchIndex % tickerMatchGroups.length]
    : undefined;
  const activeTabIndex = showTicker && hasTickerGroups ? currentMatchGroup?.matchIndex : undefined;
  const panelContent = useMemo<React.ReactElement | null>(
    () => renderPanelContent(selectedTab),
    [renderPanelContent, selectedTab],
  );

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
        tabs={tabs}
        activeTabIndex={activeTabIndex}
        selectedTab={selectedTab}
        isPanelOpen={isPanelOpen}
        onTabClick={handleTabClick}
        onScrollComplete={handleScrollComplete}
      />

      <StatsPanel
        isPanelOpen={isPanelOpen}
        nodeRef={nodeRef}
        onClosePanel={handleClosePanel}
        panelContent={panelContent}
      />
    </div>
  );
}
