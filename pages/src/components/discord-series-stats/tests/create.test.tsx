import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";
import { createDiscordSeriesStats } from "../create";
import { DiscordSeriesStatsPresenter } from "../discord-series-stats-presenter";
import { HaloMedalMetadataResolver } from "../../../services/halo/medal-metadata-resolver";
import { aFakeHaloClientWith } from "../../../services/fakes/halo-client.fake";
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
  const medalMetadataResolver = new HaloMedalMetadataResolver(aFakeHaloClientWith());

  it("renders top-level sections", () => {
    const DiscordSeriesStats = createDiscordSeriesStats({
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      medalMetadataResolver,
    });

    render(<DiscordSeriesStats data={aFakeResolvedDataWith()} />);

    expect(screen.getByRole("heading", { name: "Queue #7777 Series Stats" })).toBeInTheDocument();
    expect(screen.getByText("Guild 123456789012345678")).toBeInTheDocument();
    expect(screen.getByText("Series overview")).toBeInTheDocument();
    expect(screen.getByText("Matches")).toBeInTheDocument();
    expect(screen.getByText("Eagle")).toBeInTheDocument();
    expect(screen.getByText("Cobra")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1:0" })).toBeInTheDocument();
  });

  it("shows warning when a match has invalid raw match data", () => {
    const DiscordSeriesStats = createDiscordSeriesStats({
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      medalMetadataResolver,
    });

    render(<DiscordSeriesStats data={aFakeResolvedDataWith()} />);

    expect(screen.getByText("Failed to load detailed stats for match match-1.")).toBeInTheDocument();
  });

  it("does not render series totals when no valid raw match data exists", () => {
    const DiscordSeriesStats = createDiscordSeriesStats({
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      medalMetadataResolver,
    });

    render(<DiscordSeriesStats data={aFakeResolvedDataWith()} />);

    expect(screen.queryByText("Series Totals")).not.toBeInTheDocument();
  });

  it("constructs the presenter when rendering", () => {
    const presentSpy = vi.spyOn(DiscordSeriesStatsPresenter.prototype, "present");
    const DiscordSeriesStats = createDiscordSeriesStats({
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      medalMetadataResolver,
    });

    render(<DiscordSeriesStats data={aFakeResolvedDataWith()} />);

    expect(presentSpy).toHaveBeenCalled();
  });

  it("renders the shared series stats layout", () => {
    const DiscordSeriesStats = createDiscordSeriesStats({
      matchAnalyticsService: aFakeMatchAnalyticsServiceWith(),
      medalMetadataResolver,
    });

    render(<DiscordSeriesStats data={aFakeResolvedDataWith()} />);

    expect(screen.getByRole("heading", { name: "Series overview" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Matches" })).toBeInTheDocument();
  });

  it("fetches batch match analytics for all matches in renderData", async () => {
    const matchAnalyticsService = aFakeMatchAnalyticsServiceWith();
    const getBatchMatchAnalyticsSpy = vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics");
    const base = aFakeResolvedDataWith();
    const secondMatch = { ...base.renderData.matches[0], matchId: "match-2" };
    const DiscordSeriesStats = createDiscordSeriesStats({ matchAnalyticsService, medalMetadataResolver });

    render(
      <DiscordSeriesStats
        data={aFakeResolvedDataWith({
          matchIds: ["match-1", "match-2"],
          renderData: { ...base.renderData, matches: [...base.renderData.matches, secondMatch] },
        })}
      />,
    );

    await waitFor(() => {
      expect(getBatchMatchAnalyticsSpy).toHaveBeenCalledTimes(1);
    });

    expect(getBatchMatchAnalyticsSpy).toHaveBeenCalledWith(["match-1", "match-2"]);
  });
});
