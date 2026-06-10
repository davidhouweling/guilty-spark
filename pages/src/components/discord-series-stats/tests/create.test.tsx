import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";
import { DiscordSeriesStats } from "../create";

afterEach(() => {
  cleanup();
});

function aFakeResolvedDataWith(overrides: Partial<DiscordSeriesStatsResolved> = {}): DiscordSeriesStatsResolved {
  return {
    status: "resolved",
    guildId: "123456789012345678",
    queueNumber: 7777,
    matchIds: ["match-1"],
    renderData: {
      title: "Queue #7777 Series Stats",
      subtitle: "Guild 123456789012345678",
      seriesScore: "1:0",
      teams: [
        { name: "Eagle", players: ["Player One"] },
        { name: "Cobra", players: ["Player Two"] },
      ],
      matches: [
        {
          matchId: "match-1",
          gameTypeAndMap: "Slayer: Live Fire",
          gameVariantCategory: 0,
          gameType: "Slayer",
          gameMap: "Live Fire",
          gameMapThumbnailUrl: "data:,",
          duration: "10m 00s",
          gameScore: "50:45",
          gameSubScore: null,
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:10:00.000Z",
          playerXuidToGametag: { "xuid-1": "Player One" },
          rawMatch: {},
        },
      ],
    },
    ...overrides,
  };
}

describe("DiscordSeriesStats", () => {
  it("renders header and top-level sections", () => {
    render(<DiscordSeriesStats data={aFakeResolvedDataWith()} />);

    expect(screen.getByRole("heading", { name: "Queue #7777 Series Stats" })).toBeInTheDocument();
    expect(screen.getByText("Series overview")).toBeInTheDocument();
    expect(screen.getByText("Matches")).toBeInTheDocument();
    expect(screen.getByText("Eagle")).toBeInTheDocument();
    expect(screen.getByText("Cobra")).toBeInTheDocument();
  });

  it("shows warning when a match has invalid raw match data", () => {
    render(<DiscordSeriesStats data={aFakeResolvedDataWith()} />);

    expect(screen.getByText("Failed to load detailed stats for match match-1.")).toBeInTheDocument();
  });

  it("does not render series totals when no valid raw match data exists", () => {
    render(<DiscordSeriesStats data={aFakeResolvedDataWith()} />);

    expect(screen.queryByText("Series Totals")).not.toBeInTheDocument();
  });

  it("toggles between standard and wide view", () => {
    render(<DiscordSeriesStats data={aFakeResolvedDataWith()} />);

    const toggleButton = screen.getByRole("button", { name: "Switch to wide view" });
    expect(toggleButton).toBeInTheDocument();

    fireEvent.click(toggleButton);

    expect(screen.getByRole("button", { name: "Switch to standard view" })).toBeInTheDocument();
  });
});
