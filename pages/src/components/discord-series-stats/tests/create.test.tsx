import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";
import { DiscordSeriesStats } from "../create";
import { DiscordSeriesStatsPresenter } from "../discord-series-stats-presenter";
import { aFakeMatchAnalyticsServiceWith } from "../../../services/stats/fakes/match-analytics.fake";

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
      medalMetadata: {},
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
    render(
      <DiscordSeriesStats data={aFakeResolvedDataWith()} matchAnalyticsService={aFakeMatchAnalyticsServiceWith()} />,
    );

    expect(screen.getByRole("heading", { name: "Queue #7777 Series Stats" })).toBeInTheDocument();
    expect(screen.getByText("Series overview")).toBeInTheDocument();
    expect(screen.getByText("Matches")).toBeInTheDocument();
    expect(screen.getByText("Eagle")).toBeInTheDocument();
    expect(screen.getByText("Cobra")).toBeInTheDocument();
  });

  it("shows warning when a match has invalid raw match data", () => {
    render(
      <DiscordSeriesStats data={aFakeResolvedDataWith()} matchAnalyticsService={aFakeMatchAnalyticsServiceWith()} />,
    );

    expect(screen.getByText("Failed to load detailed stats for match match-1.")).toBeInTheDocument();
  });

  it("does not render series totals when no valid raw match data exists", () => {
    render(
      <DiscordSeriesStats data={aFakeResolvedDataWith()} matchAnalyticsService={aFakeMatchAnalyticsServiceWith()} />,
    );

    expect(screen.queryByText("Series Totals")).not.toBeInTheDocument();
  });

  it("passes medal metadata from renderData into the presenter", () => {
    const medalMetadata = { 3334154676: { name: "Killing Spree", sortingWeight: 1500 } };
    const presentSpy = vi.spyOn(DiscordSeriesStatsPresenter.prototype, "present");

    render(
      <DiscordSeriesStats
        data={aFakeResolvedDataWith({ renderData: { ...aFakeResolvedDataWith().renderData, medalMetadata } })}
        matchAnalyticsService={aFakeMatchAnalyticsServiceWith()}
      />,
    );

    expect(presentSpy).toHaveBeenCalled();
    const presenterInstance = presentSpy.mock.instances[0] as DiscordSeriesStatsPresenter;
    expect(presenterInstance.renderData.medalMetadata).toEqual(medalMetadata);
  });

  it("toggles between standard and wide view", () => {
    render(
      <DiscordSeriesStats data={aFakeResolvedDataWith()} matchAnalyticsService={aFakeMatchAnalyticsServiceWith()} />,
    );

    const toggleButton = screen.getByRole("button", { name: "Switch to wide view" });
    expect(toggleButton).toBeInTheDocument();

    fireEvent.click(toggleButton);

    expect(screen.getByRole("button", { name: "Switch to standard view" })).toBeInTheDocument();
  });

  it("fetches match analytics for each match id", async () => {
    const matchAnalyticsService = aFakeMatchAnalyticsServiceWith();
    const getMatchAnalyticsSpy = vi.spyOn(matchAnalyticsService, "getMatchAnalytics");

    render(
      <DiscordSeriesStats
        data={aFakeResolvedDataWith({ matchIds: ["match-1", "match-2"] })}
        matchAnalyticsService={matchAnalyticsService}
      />,
    );

    await waitFor(() => {
      expect(getMatchAnalyticsSpy).toHaveBeenCalledTimes(2);
    });

    expect(getMatchAnalyticsSpy).toHaveBeenCalledWith("match-1");
    expect(getMatchAnalyticsSpy).toHaveBeenCalledWith("match-2");
  });
});
