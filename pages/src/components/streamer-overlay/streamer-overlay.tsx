import React, { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import classNames from "classnames";
import type { TeamColor } from "../team-colors/team-colors";
import type { TickerMatchGroup } from "../information-ticker/information-ticker";
import type { OverlayTab } from "./tabs-bar";
import { BottomSection } from "./bottom-section";
import { StatsPanel } from "./stats-panel/stats-panel";
import { StreamerOverlayPresenter } from "./streamer-overlay-presenter";
import { StreamerOverlayStore } from "./streamer-overlay-store";
import styles from "./streamer-overlay.module.css";

export interface StreamerOverlayProps {
  readonly topSection: React.ReactNode;
  readonly pinTopSection?: boolean;
  readonly teamColors: TeamColor[];
  readonly tabs: readonly OverlayTab[];
  readonly tickerMatchGroups: readonly TickerMatchGroup[];
  readonly showTabs: boolean;
  readonly showTicker: boolean;
  readonly matchesLength: number;
  readonly showPreview: boolean;
  readonly previewMode: "player" | "observer";
  readonly fontSizeStyles: React.CSSProperties;
  readonly settingsUi: React.ReactNode;
  readonly hasPanelContent: (tabIndex: number) => boolean;
  readonly renderPanelContent: (tabIndex: number) => React.ReactElement | null;
  readonly panelOpen?: boolean;
  readonly onTabClick?: (tabIndex: number) => void;
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
  matchesLength,
  showPreview,
  previewMode,
  fontSizeStyles,
  settingsUi,
  hasPanelContent,
  renderPanelContent,
  panelOpen,
  onTabClick,
  onClosePanel,
}: StreamerOverlayProps): React.ReactElement {
  const store = useMemo(() => new StreamerOverlayStore(), []);
  const presenter = useMemo(() => new StreamerOverlayPresenter({ store }), [store]);
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const getSnapshot = useCallback(() => store.getSnapshot(), [store]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const nodeRef = useRef<HTMLDivElement>(null);

  const handleScrollComplete = useCallback((): void => {
    presenter.onScrollComplete(tickerMatchGroups);
  }, [presenter, tickerMatchGroups]);

  useEffect(() => {
    presenter.syncCurrentMatchIndex(tickerMatchGroups);
  }, [presenter, tickerMatchGroups]);

  useEffect(() => {
    presenter.syncLatestMatch({
      showTicker,
      matchesLength,
      tickerMatchGroups,
    });
  }, [matchesLength, presenter, showTicker, tickerMatchGroups]);

  const handleTabClick = useCallback(
    (tabIndex: number): void => {
      presenter.handleTabClick({
        tabIndex,
        hasPanelContent,
        onTabClick,
        panelOpen,
      });
    },
    [hasPanelContent, onTabClick, panelOpen, presenter],
  );

  const handleClosePanel = useCallback((): void => {
    presenter.handleClosePanel(onClosePanel);
  }, [onClosePanel, presenter]);

  const viewModel = useMemo(
    () =>
      presenter.present(snapshot, {
        showTicker,
        tickerMatchGroups,
        panelOpen,
        renderPanelContent,
      }),
    [panelOpen, presenter, renderPanelContent, showTicker, snapshot, tickerMatchGroups],
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
        currentMatchGroup={viewModel.currentMatchGroup}
        teamColors={teamColors}
        tabs={tabs}
        activeTabIndex={viewModel.activeTabIndex}
        selectedTab={viewModel.selectedTab}
        isPanelOpen={viewModel.isPanelOpen}
        onTabClick={handleTabClick}
        onScrollComplete={handleScrollComplete}
      />

      <StatsPanel
        isPanelOpen={viewModel.isPanelOpen}
        nodeRef={nodeRef}
        onClosePanel={handleClosePanel}
        panelContent={viewModel.panelContent}
      />
    </div>
  );
}
