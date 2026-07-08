import React, { useRef } from "react";
import classNames from "classnames";
import type { TeamColor } from "../team-colors/team-colors";
import type { TickerMatchGroup } from "../information-ticker/information-ticker";
import type { OverlayTab } from "./tabs-bar";
import { BottomSection } from "./bottom-section";
import { StatsPanel } from "./stats-panel/stats-panel";
import styles from "./streamer-overlay.module.css";

export interface StreamerOverlayComponentProps {
  readonly topSection: React.ReactNode;
  readonly pinTopSection?: boolean;
  readonly teamColors: TeamColor[];
  readonly tabs: readonly OverlayTab[];
  readonly showTabs: boolean;
  readonly showTicker: boolean;
  readonly showPreview: boolean;
  readonly previewMode: "player" | "observer";
  readonly fontSizeStyles: React.CSSProperties;
  readonly settingsUi: React.ReactNode;
  readonly currentMatchGroup: TickerMatchGroup | undefined;
  readonly activeTabIndex: number | undefined;
  readonly selectedTab: number;
  readonly isPanelOpen: boolean;
  readonly panelContent: React.ReactElement | null;
  readonly onTabClick: (tabIndex: number) => void;
  readonly onScrollComplete: () => void;
  readonly onClosePanel: () => void;
}

export function StreamerOverlay({
  topSection,
  pinTopSection = false,
  teamColors,
  tabs,
  showTabs,
  showTicker,
  showPreview,
  previewMode,
  fontSizeStyles,
  settingsUi,
  currentMatchGroup,
  activeTabIndex,
  selectedTab,
  isPanelOpen,
  panelContent,
  onTabClick,
  onScrollComplete,
  onClosePanel,
}: StreamerOverlayComponentProps): React.ReactElement {
  const nodeRef = useRef<HTMLDivElement>(null);

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
        currentMatchGroup={currentMatchGroup}
        teamColors={teamColors}
        tabs={tabs}
        activeTabIndex={activeTabIndex}
        selectedTab={selectedTab}
        isPanelOpen={isPanelOpen}
        onTabClick={onTabClick}
        onScrollComplete={onScrollComplete}
      />

      <StatsPanel isPanelOpen={isPanelOpen} nodeRef={nodeRef} onClosePanel={onClosePanel} panelContent={panelContent} />
    </div>
  );
}
