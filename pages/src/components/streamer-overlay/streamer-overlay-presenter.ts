import type React from "react";
import type { TickerMatchGroup } from "../information-ticker/information-ticker";
import type { StreamerOverlaySnapshot, StreamerOverlayStore } from "./streamer-overlay-store";

interface StreamerOverlayPresenterConfig {
  readonly store: StreamerOverlayStore;
}

interface HandleTabClickOptions {
  readonly tabIndex: number;
  readonly hasPanelContent: (tabIndex: number) => boolean;
  readonly onTabClick?: (tabIndex: number) => void;
  readonly panelOpen: boolean | undefined;
}

interface SyncLatestMatchOptions {
  readonly showTicker: boolean;
  readonly matchesLength: number;
  readonly tickerMatchGroups: readonly TickerMatchGroup[];
}

interface PresentOptions {
  readonly showTicker: boolean;
  readonly tickerMatchGroups: readonly TickerMatchGroup[];
  readonly panelOpen: boolean | undefined;
  readonly renderPanelContent: (tabIndex: number) => React.ReactElement | null;
}

export interface StreamerOverlayViewModel {
  readonly selectedTab: number;
  readonly isPanelOpen: boolean;
  readonly currentMatchGroup: TickerMatchGroup | undefined;
  readonly activeTabIndex: number | undefined;
  readonly panelContent: React.ReactElement | null;
}

export class StreamerOverlayPresenter {
  private readonly config: StreamerOverlayPresenterConfig;

  public constructor(config: StreamerOverlayPresenterConfig) {
    this.config = config;
  }

  public onScrollComplete(tickerMatchGroups: readonly TickerMatchGroup[]): void {
    if (tickerMatchGroups.length === 0) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    const nextMatchIndex = (snapshot.currentMatchIndex + 1) % tickerMatchGroups.length;
    this.config.store.setCurrentMatchIndex(nextMatchIndex);
  }

  public syncCurrentMatchIndex(tickerMatchGroups: readonly TickerMatchGroup[]): void {
    const snapshot = this.config.store.getSnapshot();

    if (tickerMatchGroups.length === 0) {
      if (snapshot.currentMatchIndex !== 0) {
        this.config.store.setCurrentMatchIndex(0);
      }
      return;
    }

    if (snapshot.currentMatchIndex < tickerMatchGroups.length) {
      return;
    }

    this.config.store.setCurrentMatchIndex(0);
  }

  public syncLatestMatch(options: SyncLatestMatchOptions): void {
    if (!options.showTicker) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    const currentMatchCount = options.matchesLength;

    let nextCurrentMatchIndex = snapshot.currentMatchIndex;

    if (currentMatchCount > snapshot.previousMatchCount && snapshot.previousMatchCount > 0) {
      const latestMatchIndex = options.tickerMatchGroups.findIndex(
        (group) => group.matchIndex === currentMatchCount - 1,
      );
      if (latestMatchIndex !== -1) {
        nextCurrentMatchIndex = latestMatchIndex;
      }
    }

    this.config.store.batchUpdate({
      currentMatchIndex: nextCurrentMatchIndex,
      previousMatchCount: currentMatchCount,
    });
  }

  public handleTabClick(options: HandleTabClickOptions): void {
    const snapshot = this.config.store.getSnapshot();
    options.onTabClick?.(options.tabIndex);

    if (!options.hasPanelContent(options.tabIndex)) {
      this.config.store.setSelectedTab(options.tabIndex);
      return;
    }

    const isPanelOpen = options.panelOpen ?? snapshot.internalIsPanelOpen;
    const openPanel = snapshot.selectedTab === options.tabIndex ? !isPanelOpen : true;

    this.config.store.batchUpdate({
      selectedTab: options.tabIndex,
      internalIsPanelOpen: openPanel,
    });
  }

  public handleClosePanel(onClosePanel?: () => void): void {
    this.config.store.setInternalIsPanelOpen(false);
    onClosePanel?.();
  }

  public present(snapshot: StreamerOverlaySnapshot, options: PresentOptions): StreamerOverlayViewModel {
    const hasTickerGroups = options.tickerMatchGroups.length > 0;
    const currentMatchGroup = hasTickerGroups
      ? options.tickerMatchGroups[snapshot.currentMatchIndex % options.tickerMatchGroups.length]
      : undefined;
    const activeTabIndex = options.showTicker && currentMatchGroup != null ? currentMatchGroup.matchIndex : undefined;

    return {
      selectedTab: snapshot.selectedTab,
      isPanelOpen: options.panelOpen ?? snapshot.internalIsPanelOpen,
      currentMatchGroup,
      activeTabIndex,
      panelContent: options.renderPanelContent(snapshot.selectedTab),
    };
  }
}
