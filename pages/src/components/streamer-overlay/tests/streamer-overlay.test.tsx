import "@testing-library/jest-dom/vitest";

import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TeamColor } from "../../team-colors/team-colors";
import type { OverlayTab } from "../tabs-bar";
import type { TickerMatchGroup } from "../../information-ticker/information-ticker";
import { StreamerOverlayCreate, type StreamerOverlayProps } from "../create";

vi.mock("../../information-ticker/information-ticker", () => ({
  InformationTicker: (): React.ReactNode => <div data-testid="information-ticker">Information Ticker</div>,
}));

afterEach(() => {
  cleanup();
});

describe("StreamerOverlay", () => {
  const teamColors: TeamColor[] = [
    { id: "eagle", name: "Eagle", hex: "#0066CC" },
    { id: "cobra", name: "Cobra", hex: "#CC0000" },
  ];

  const tabs: readonly OverlayTab[] = [
    {
      type: "series",
      seriesId: "series-1",
      index: -1,
      label: "Series score",
      score: "1:0",
      teamColor: undefined,
    },
  ];

  const tickerMatchGroups: readonly TickerMatchGroup[] = [
    {
      matchIndex: -1,
      label: "Series Stats",
      rows: [
        {
          type: "team",
          teamId: 0,
          name: "Eagle",
          stats: [],
          medals: [],
        },
      ],
    },
  ];

  const defaultProps: StreamerOverlayProps = {
    topSection: <div>Top Section</div>,
    teamColors,
    tabs,
    tickerMatchGroups,
    showTabs: true,
    showTicker: true,
    matchesLength: 1,
    showPreview: false,
    previewMode: "observer",
    fontSizeStyles: {},
    settingsUi: <div>Settings UI</div>,
    hasPanelContent: () => true,
    renderPanelContent: () => <div>Panel Body</div>,
  };

  it("renders settings and top section", () => {
    render(<StreamerOverlayCreate {...defaultProps} />);

    expect(screen.getByText("Settings UI")).toBeInTheDocument();
    expect(screen.getByText("Top Section")).toBeInTheDocument();
  });

  it("renders information ticker when enabled", () => {
    render(<StreamerOverlayCreate {...defaultProps} />);

    expect(screen.getByTestId("information-ticker")).toBeInTheDocument();
  });

  it("opens panel when tab is clicked", () => {
    render(<StreamerOverlayCreate {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: /series score/i }));

    expect(screen.getByText("Panel Body")).toBeInTheDocument();
  });

  it("hides bottom section when tabs and ticker are disabled", () => {
    render(<StreamerOverlayCreate {...defaultProps} showTabs={false} showTicker={false} />);

    expect(screen.queryByRole("button", { name: /series score/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("information-ticker")).not.toBeInTheDocument();
  });
});
