import React, { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { TeamColor } from "../team-colors/team-colors";
import type { TickerMatchGroup } from "../information-ticker/information-ticker";
import type { OverlayTab } from "./tabs-bar";
import { StreamerOverlayPresenter } from "./streamer-overlay-presenter";
import { StreamerOverlayStore } from "./streamer-overlay-store";
import { StreamerOverlay } from "./streamer-overlay";

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

export function StreamerOverlayCreate({
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
    <StreamerOverlay
      topSection={topSection}
      pinTopSection={pinTopSection}
      teamColors={teamColors}
      tabs={tabs}
      showTabs={showTabs}
      showTicker={showTicker}
      showPreview={showPreview}
      previewMode={previewMode}
      fontSizeStyles={fontSizeStyles}
      settingsUi={settingsUi}
      currentMatchGroup={viewModel.currentMatchGroup}
      activeTabIndex={viewModel.activeTabIndex}
      selectedTab={viewModel.selectedTab}
      isPanelOpen={viewModel.isPanelOpen}
      panelContent={viewModel.panelContent}
      onTabClick={handleTabClick}
      onScrollComplete={handleScrollComplete}
      onClosePanel={handleClosePanel}
    />
  );
}

export const StreamerOverlaySection = StreamerOverlayCreate;
