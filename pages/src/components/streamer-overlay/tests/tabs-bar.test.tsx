import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OverlayTabsBar } from "../tabs-bar";
import type { OverlayTab } from "../tabs-bar";

afterEach(() => {
  cleanup();
});

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

describe("OverlayTabsBar", () => {
  it("renders all tabs passed by the presenter", () => {
    const tabs: readonly OverlayTab[] = [
      aSeriesTabWith(),
      aMatchTabWith(0),
      aMatchTabWith(1),
      aMatchTabWith(2),
      aMatchTabWith(3),
      aMatchTabWith(4),
    ];

    render(
      <OverlayTabsBar
        tabs={tabs}
        activeTabIndex={undefined}
        selectedTab={-99}
        isPanelOpen={false}
        onTabClick={(): void => undefined}
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(tabs.length);
  });

  it("calls onTabClick with the tab index", async () => {
    const user = userEvent.setup();
    const onTabClick = vi.fn<(tabIndex: number) => void>();

    render(
      <OverlayTabsBar
        tabs={[aSeriesTabWith(), aMatchTabWith(0), aMatchTabWith(1)]}
        activeTabIndex={undefined}
        selectedTab={-99}
        isPanelOpen={false}
        onTabClick={onTabClick}
      />,
    );

    await user.click(screen.getByRole("button", { name: /match 1/i }));

    expect(onTabClick).toHaveBeenCalledWith(1);
  });

  it("renders upcoming tabs as disabled and does not handle clicks", async () => {
    const user = userEvent.setup();
    const onTabClick = vi.fn<(tabIndex: number) => void>();
    const upcomingTab: OverlayTab = {
      type: "upcoming",
      index: 3,
      label: "Oddball: Live Fire",
      icons: [{ src: "/oddball.png", dimmed: false }],
    };

    render(
      <OverlayTabsBar
        tabs={[aSeriesTabWith(), aMatchTabWith(0), upcomingTab]}
        activeTabIndex={undefined}
        selectedTab={3}
        isPanelOpen={true}
        onTabClick={onTabClick}
      />,
    );

    const upcomingButton = screen.getByRole("button", { name: "Oddball: Live Fire" });
    expect(upcomingButton).toBeDisabled();
    expect(upcomingButton.className).not.toContain("tabActive");
    expect(upcomingButton.className).not.toContain("tabSelected");

    await user.click(upcomingButton);

    expect(onTabClick).not.toHaveBeenCalled();
  });
});
