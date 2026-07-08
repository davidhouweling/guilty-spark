import { describe, expect, it } from "vitest";
import type { OverlayTab } from "../tabs-bar";
import { getOverlayTabDisplayLimit, getVisibleTabsForWidth } from "../tabs-bar";

function aSeriesTabWith(overrides?: Partial<OverlayTab>): OverlayTab {
  return {
    type: "series",
    seriesId: "series-1",
    index: -1,
    label: "Series",
    score: "2:1",
    teamColor: "#00AAFF",
    ...overrides,
  } as OverlayTab;
}

function aMatchTabWith(index: number): OverlayTab {
  return {
    type: "match",
    index,
    matchId: `match-${index.toString()}`,
    label: `Match ${index.toString()}`,
    score: "50:45",
    icon: "/mode.png",
    teamColor: "#00AAFF",
  };
}

describe("tabs-bar width behavior", () => {
  it("computes display limit from container width", () => {
    const tabs: readonly OverlayTab[] = [aSeriesTabWith(), aMatchTabWith(0), aMatchTabWith(1), aMatchTabWith(2)];

    expect(getOverlayTabDisplayLimit(264, tabs)).toBe(2);
    expect(getOverlayTabDisplayLimit(120, tabs)).toBe(1);
  });

  it("accounts for series tab width when series tab is not first in the list", () => {
    const tabs: readonly OverlayTab[] = [aMatchTabWith(0), aMatchTabWith(1), aSeriesTabWith()];

    // containerWidth 168: with match-first ordering a naive walk yields limit=2 (80+84=164≤168),
    // but the visible set would include the wider series tab (100px) causing overflow.
    // Sorting widths descending (100 first) gives limit=1, preventing that overflow.
    expect(getOverlayTabDisplayLimit(168, tabs)).toBe(1);
  });

  it("keeps series summary and newest tabs when overflowing", () => {
    const tabs: readonly OverlayTab[] = [
      aSeriesTabWith(),
      aMatchTabWith(0),
      aMatchTabWith(1),
      aMatchTabWith(2),
      aMatchTabWith(3),
      aMatchTabWith(4),
    ];

    const visibleTabs = getVisibleTabsForWidth({
      tabs,
      displayLimit: 4,
      activeTabIndex: undefined,
      selectedTab: -99,
    });

    expect(visibleTabs.map((tab) => tab.index)).toEqual([-1, 2, 3, 4]);
  });

  it("keeps series summary tab when it is not first and tabs are overflowing", () => {
    const tabs: readonly OverlayTab[] = [
      aMatchTabWith(0),
      aMatchTabWith(1),
      aMatchTabWith(2),
      aMatchTabWith(3),
      aSeriesTabWith(),
    ];

    const visibleTabs = getVisibleTabsForWidth({
      tabs,
      displayLimit: 3,
      activeTabIndex: undefined,
      selectedTab: -99,
    });

    expect(visibleTabs.map((tab) => tab.index)).toEqual([2, 3, -1]);
  });

  it("preserves active and selected tabs when overflowing", () => {
    const tabs: readonly OverlayTab[] = [
      aSeriesTabWith(),
      aMatchTabWith(0),
      aMatchTabWith(1),
      aMatchTabWith(2),
      aMatchTabWith(3),
      aMatchTabWith(4),
      aMatchTabWith(5),
    ];

    const visibleTabs = getVisibleTabsForWidth({
      tabs,
      displayLimit: 4,
      activeTabIndex: 1,
      selectedTab: 3,
    });

    expect(visibleTabs.map((tab) => tab.index)).toEqual([-1, 1, 3, 5]);
  });

  it("fills remaining slots when active and selected tabs are the same tab", () => {
    const tabs: readonly OverlayTab[] = [
      aSeriesTabWith(),
      aMatchTabWith(0),
      aMatchTabWith(1),
      aMatchTabWith(2),
      aMatchTabWith(3),
      aMatchTabWith(4),
    ];

    const visibleTabs = getVisibleTabsForWidth({
      tabs,
      displayLimit: 3,
      activeTabIndex: 2,
      selectedTab: 2,
    });

    expect(visibleTabs.map((tab) => tab.index)).toEqual([-1, 2, 4]);
  });

  it("prioritizes active ticker tab over selected tab when only one slot is available", () => {
    const tabs: readonly OverlayTab[] = [
      aSeriesTabWith(),
      aMatchTabWith(0),
      aMatchTabWith(1),
      aMatchTabWith(2),
      aMatchTabWith(3),
    ];

    const visibleTabs = getVisibleTabsForWidth({
      tabs,
      displayLimit: 1,
      activeTabIndex: 2,
      selectedTab: 0,
    });

    expect(visibleTabs.map((tab) => tab.index)).toEqual([2]);
  });
});
