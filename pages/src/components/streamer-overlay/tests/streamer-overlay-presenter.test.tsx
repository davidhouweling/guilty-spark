import React from "react";
import { describe, expect, it } from "vitest";
import type { TickerMatchGroup } from "../../information-ticker/information-ticker";
import { StreamerOverlayPresenter } from "../streamer-overlay-presenter";
import { StreamerOverlayStore } from "../streamer-overlay-store";

function aTickerMatchGroupWith(matchIndex: number): TickerMatchGroup {
  return {
    matchIndex,
    label: `Match ${matchIndex.toString()}`,
    rows: [],
  };
}

describe("StreamerOverlayPresenter", () => {
  it("toggles internal panel state when clicking the same tab with panel content", () => {
    const store = new StreamerOverlayStore();
    const presenter = new StreamerOverlayPresenter({ store });

    presenter.handleTabClick({
      tabIndex: 2,
      hasPanelContent: () => true,
      panelOpen: undefined,
    });

    expect(store.getSnapshot().selectedTab).toBe(2);
    expect(store.getSnapshot().internalIsPanelOpen).toBe(true);

    presenter.handleTabClick({
      tabIndex: 2,
      hasPanelContent: () => true,
      panelOpen: undefined,
    });

    expect(store.getSnapshot().internalIsPanelOpen).toBe(false);
  });

  it("moves ticker index to latest match when match count increases", () => {
    const store = new StreamerOverlayStore();
    const presenter = new StreamerOverlayPresenter({ store });
    const tickerMatchGroups: readonly TickerMatchGroup[] = [
      aTickerMatchGroupWith(0),
      aTickerMatchGroupWith(1),
      aTickerMatchGroupWith(2),
    ];

    store.setPreviousMatchCount(2);
    store.setCurrentMatchIndex(0);

    presenter.syncLatestMatch({
      showTicker: true,
      matchesLength: 3,
      tickerMatchGroups,
    });

    expect(store.getSnapshot().currentMatchIndex).toBe(2);
    expect(store.getSnapshot().previousMatchCount).toBe(3);
  });

  it("resets current ticker index when it is out of range", () => {
    const store = new StreamerOverlayStore();
    const presenter = new StreamerOverlayPresenter({ store });

    store.setCurrentMatchIndex(3);

    presenter.syncCurrentMatchIndex([aTickerMatchGroupWith(0)]);

    expect(store.getSnapshot().currentMatchIndex).toBe(0);
  });

  it("derives active tab and panel state in present", () => {
    const store = new StreamerOverlayStore();
    const presenter = new StreamerOverlayPresenter({ store });

    store.setSelectedTab(5);
    store.setCurrentMatchIndex(0);

    const viewModel = presenter.present(store.getSnapshot(), {
      showTicker: true,
      tickerMatchGroups: [aTickerMatchGroupWith(7)],
      panelOpen: true,
      renderPanelContent: (tabIndex): React.ReactElement => <div>{tabIndex.toString()}</div>,
    });

    expect(viewModel.selectedTab).toBe(5);
    expect(viewModel.isPanelOpen).toBe(true);
    expect(viewModel.activeTabIndex).toBe(7);
    expect(viewModel.currentMatchGroup?.matchIndex).toBe(7);
    expect(viewModel.panelContent).not.toBeNull();
  });
});
