import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IndividualTrackerViewer } from "../individual-tracker-viewer";
import type { IndividualTrackerViewerRenderModel } from "../../types";

vi.mock("../../../stats/match-stats", () => ({
  MatchStats: ({ id }: { id: string }): React.ReactNode => <div>match-stats-body-{id}</div>,
  MatchStatsHeader: ({ title }: { title: string }): React.ReactNode => <div>{title}</div>,
}));

vi.mock("../../../stats/series-stats", () => ({
  SeriesStats: (): React.ReactNode => <div>series-stats-body</div>,
}));

vi.mock("../../../stats/series-overview/series-overview", () => ({
  SeriesOverview: (): React.ReactNode => <div>series-overview-body</div>,
}));

afterEach(() => {
  cleanup();
});

function aRenderModelWith(): IndividualTrackerViewerRenderModel {
  return {
    lastUpdatedTime: "2026-01-01T00:00:00.000Z",
    trackerStatus: "active",
    accumulatedStats: {
      total: 3,
      wins: 2,
      losses: 1,
      ties: 0,
      customOrLocal: 3,
      matchmaking: 0,
      groupedSeries: 1,
      standalone: 1,
    },
    teamColors: [
      { id: "salmon", name: "Salmon", hex: "#ff6b6b" },
      { id: "cerulean", name: "Cerulean", hex: "#3b82f6" },
    ],
    trackedPlayerTotals: {
      teamData: [],
      playerData: [],
      metadata: null,
      title: "TrackedPlayer Totals",
    },
    gameplayTimeline: [
      {
        type: "group",
        id: "series:m1:m2",
        title: "Dog Crew",
        subtitle: "Best of 3",
        seriesScore: "2:0",
        overviewMatches: [],
        teams: [],
        seriesTotals: {
          teamData: [],
          playerData: [],
          metadata: null,
        },
        matches: [
          {
            id: "m1",
            matchStats: [],
            backgroundImageUrl: "data:,",
            gameMode: "Slayer",
            matchNumber: 1,
            gameTypeAndMap: "Slayer: Aquarius",
            duration: "10m 0s",
            score: "Win - 50:40",
            startTime: "2026-01-01T00:00:00.000Z",
            endTime: "2026-01-01T00:10:00.000Z",
          },
        ],
      },
      {
        type: "match",
        id: "m3",
        match: {
          id: "m3",
          matchStats: [],
          backgroundImageUrl: "data:,",
          gameMode: "Slayer",
          matchNumber: 3,
          gameTypeAndMap: "Slayer: Bazaar",
          duration: "12m 0s",
          score: "Loss - 40:50",
          startTime: "2026-01-01T00:30:00.000Z",
          endTime: "2026-01-01T00:42:00.000Z",
        },
      },
    ],
    trackedEntriesCount: 3,
  };
}

describe("IndividualTrackerViewer", () => {
  it("expands series and standalone matches by default and allows toggling them", () => {
    render(
      <IndividualTrackerViewer
        trackerId="tracker-1"
        viewSource="tracker"
        connectionStatus="connected"
        errorMessage={null}
        renderModel={aRenderModelWith()}
        matchHistoryLoading={false}
        onBackToManage={vi.fn()}
      />,
    );

    expect(screen.getByText("series-overview-body")).toBeInTheDocument();
    expect(screen.getByText("match-stats-body-m3")).toBeInTheDocument();

    const seriesToggle = screen.getByRole("button", { name: /Dog Crew/i });
    const matchToggle = screen.getByRole("button", { name: /Match 3: Slayer: Bazaar/i });

    fireEvent.click(seriesToggle);
    fireEvent.click(matchToggle);

    expect(seriesToggle).toHaveAttribute("aria-expanded", "false");
    expect(matchToggle).toHaveAttribute("aria-expanded", "false");
  });

  it("toggles wide view from the accumulated stats header", () => {
    render(
      <IndividualTrackerViewer
        trackerId="tracker-1"
        viewSource="tracker"
        connectionStatus="connected"
        errorMessage={null}
        renderModel={aRenderModelWith()}
        matchHistoryLoading={false}
        onBackToManage={vi.fn()}
      />,
    );

    const wideViewButton = screen.getByRole("button", { name: /Wide view/i });
    fireEvent.click(wideViewButton);

    expect(screen.getByRole("button", { name: /Standard width/i })).toBeInTheDocument();
  });

  it("preserves collapsed series state across rerenders", () => {
    const { rerender } = render(
      <IndividualTrackerViewer
        trackerId="tracker-1"
        viewSource="tracker"
        connectionStatus="connected"
        errorMessage={null}
        renderModel={aRenderModelWith()}
        matchHistoryLoading={false}
        onBackToManage={vi.fn()}
      />,
    );

    const seriesToggle = screen.getByRole("button", { name: /Dog Crew/i });

    fireEvent.click(seriesToggle);
    expect(seriesToggle).toHaveAttribute("aria-expanded", "false");

    rerender(
      <IndividualTrackerViewer
        trackerId="tracker-1"
        viewSource="tracker"
        connectionStatus="connected"
        errorMessage={null}
        renderModel={aRenderModelWith()}
        matchHistoryLoading={false}
        onBackToManage={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Dog Crew/i })).toHaveAttribute("aria-expanded", "false");
  });
});
