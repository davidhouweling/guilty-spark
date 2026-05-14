import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { GameVariantCategory } from "halo-infinite-api";
import { IndividualTrackerViewer } from "../individual-tracker-viewer";
import type { IndividualTrackerViewerRenderModel } from "../../types";
import type { TrackerSearchResult } from "../../../../services/individual-tracker/types";
import type { IndividualTrackerTopBarStatItem } from "../../top-bar-stats";

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

vi.mock("../../../player-pre-series-info/player-pre-series-info", () => ({
  PlayerPreSeriesInfo: (): React.ReactNode => <div>player-pre-series-info-body</div>,
}));

vi.mock("react-time-ago", () => ({
  default: ({ date }: { date: Date }): React.ReactNode => <span>{date.toISOString()}</span>,
}));

vi.mock("../../../icons/rank-icon", () => ({
  RankIcon: (): React.ReactNode => <span>rank-icon</span>,
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
    activeNeatQueueSeries: null,
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
            gameVariantCategory: GameVariantCategory.MultiplayerSlayer,
            gameMode: "Slayer",
            matchNumber: 1,
            gameTypeAndMap: "Slayer: Aquarius",
            map: "Aquarius",
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
          gameVariantCategory: GameVariantCategory.MultiplayerSlayer,
          gameMode: "Slayer",
          matchNumber: 3,
          gameTypeAndMap: "Slayer: Bazaar",
          map: "Bazaar",
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

function aTrackerSummaryWith(): TrackerSearchResult {
  return {
    gamertag: "Chief",
    xuid: "xuid-1",
    rankLabel: "Onyx",
    csrLabel: "1500",
    currentRankTier: "Onyx",
    currentRankSubTier: 0,
    currentRankMeasurementMatchesRemaining: null,
    currentRankInitialMeasurementMatches: null,
    allTimePeakRankLabel: "Onyx",
    allTimePeakCsrLabel: "1600",
    allTimePeakRankTier: "Onyx",
    allTimePeakRankSubTier: 0,
    seasonPeakCsrLabel: "1550",
    seasonPeakRankTier: "Onyx",
    seasonPeakRankSubTier: 0,
    matchmadeMatchCount: 1234,
    customMatchCount: 456,
  };
}

function aTopBarStatsWith(): readonly IndividualTrackerTopBarStatItem[] {
  return [
    {
      option: "matches-win-loss",
      label: "Won:Loss",
      value: "2:1",
    },
    {
      option: "current-rank",
      label: "Current Rank",
      value: "Onyx (1500)",
    },
  ];
}

describe("IndividualTrackerViewer", () => {
  it("expands series and standalone matches by default and allows toggling them", () => {
    render(
      <IndividualTrackerViewer
        trackerGamertag="Chief"
        connectionStatus="connected"
        errorMessage={null}
        canManage={true}
        refreshInProgress={false}
        refreshStartedAt={null}
        refreshPending={false}
        refreshMessage={null}
        trackerSummary={aTrackerSummaryWith()}
        renderModel={aRenderModelWith()}
        topBarStats={aTopBarStatsWith()}
        matchHistoryLoading={false}
        onBackToManage={vi.fn()}
        onRefresh={vi.fn()}
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
        trackerGamertag="Chief"
        connectionStatus="connected"
        errorMessage={null}
        canManage={true}
        refreshInProgress={false}
        refreshStartedAt={null}
        refreshPending={false}
        refreshMessage={null}
        trackerSummary={aTrackerSummaryWith()}
        renderModel={aRenderModelWith()}
        topBarStats={aTopBarStatsWith()}
        matchHistoryLoading={false}
        onBackToManage={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    const wideViewButton = screen.getByRole("button", { name: /Wide view/i });
    fireEvent.click(wideViewButton);

    expect(screen.getByRole("button", { name: /Standard width/i })).toBeInTheDocument();
  });

  it("preserves collapsed series state across rerenders", () => {
    const { rerender } = render(
      <IndividualTrackerViewer
        trackerGamertag="Chief"
        connectionStatus="connected"
        errorMessage={null}
        canManage={true}
        refreshInProgress={false}
        refreshStartedAt={null}
        refreshPending={false}
        refreshMessage={null}
        trackerSummary={aTrackerSummaryWith()}
        renderModel={aRenderModelWith()}
        topBarStats={aTopBarStatsWith()}
        matchHistoryLoading={false}
        onBackToManage={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    const seriesToggle = screen.getByRole("button", { name: /Dog Crew/i });

    fireEvent.click(seriesToggle);
    expect(seriesToggle).toHaveAttribute("aria-expanded", "false");

    rerender(
      <IndividualTrackerViewer
        trackerGamertag="Chief"
        connectionStatus="connected"
        errorMessage={null}
        canManage={true}
        refreshInProgress={false}
        refreshStartedAt={null}
        refreshPending={false}
        refreshMessage={null}
        trackerSummary={aTrackerSummaryWith()}
        renderModel={aRenderModelWith()}
        topBarStats={aTopBarStatsWith()}
        matchHistoryLoading={false}
        onBackToManage={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Dog Crew/i })).toHaveAttribute("aria-expanded", "false");
  });

  it("shows owner-only manage actions above the header and removes the old tracker copy", () => {
    render(
      <IndividualTrackerViewer
        trackerGamertag="Chief"
        connectionStatus="connected"
        errorMessage={null}
        canManage={true}
        refreshInProgress={false}
        refreshStartedAt={null}
        refreshPending={false}
        refreshMessage={null}
        trackerSummary={aTrackerSummaryWith()}
        renderModel={aRenderModelWith()}
        topBarStats={aTopBarStatsWith()}
        matchHistoryLoading={false}
        onBackToManage={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /Back to manager/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Refresh/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Chief Tracker/i })).toBeInTheDocument();
    expect(screen.getByText(/Current rank:/i)).toBeInTheDocument();
    expect(screen.getByText("1,500")).toBeInTheDocument();
    expect(screen.getByText("1,550")).toBeInTheDocument();
    expect(screen.getByText("1,600")).toBeInTheDocument();
    expect(screen.queryByText(/Tracker ID/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Viewing Tracker/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Live view for tracker/i)).not.toBeInTheDocument();
    expect(screen.getByText("2026-01-01T00:00:00.000Z")).toBeInTheDocument();
  });

  it("hides manage actions for non-owners", () => {
    render(
      <IndividualTrackerViewer
        trackerGamertag="Chief"
        connectionStatus="connected"
        errorMessage={null}
        canManage={false}
        refreshInProgress={false}
        refreshStartedAt={null}
        refreshPending={false}
        refreshMessage={null}
        trackerSummary={aTrackerSummaryWith()}
        renderModel={aRenderModelWith()}
        matchHistoryLoading={false}
        onBackToManage={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /Back to manager/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refresh/i })).not.toBeInTheDocument();
  });

  it("renders active NeatQueue pre-series info when available", () => {
    render(
      <IndividualTrackerViewer
        trackerGamertag="Chief"
        connectionStatus="connected"
        errorMessage={null}
        canManage={false}
        refreshInProgress={false}
        refreshStartedAt={null}
        refreshPending={false}
        refreshMessage={null}
        trackerSummary={aTrackerSummaryWith()}
        renderModel={{
          ...aRenderModelWith(),
          activeNeatQueueSeries: {
            title: "Clutch Academy",
            subtitle: "Queue #12",
            seriesScore: "0:0",
            teams: [
              {
                name: "Eagles",
                players: [
                  { id: "player-1", displayName: "TrackedPlayer" },
                  { id: "player-2", displayName: "Teammate" },
                ],
              },
              {
                name: "Cobras",
                players: [
                  { id: "player-3", displayName: "Enemy1" },
                  { id: "player-4", displayName: "Enemy2" },
                ],
              },
            ],
            playersAssociationData: {},
            substitutions: [
              {
                id: "sub-1",
                playerOutDisplayName: "Enemy1",
                playerInDisplayName: "SubPlayer",
                teamName: "Cobras",
                timestamp: "2026-01-01T00:05:00.000Z",
              },
            ],
          },
        }}
        topBarStats={aTopBarStatsWith()}
        matchHistoryLoading={false}
        onBackToManage={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getAllByText("series-overview-body")).toHaveLength(2);
    expect(screen.getByText("player-pre-series-info-body")).toBeInTheDocument();
    expect(screen.getByText(/SubPlayer/i)).toBeInTheDocument();
    expect(screen.getByText(/Queue #12/i)).toBeInTheDocument();
  });

  it("renders presenter-provided top bar stats", () => {
    render(
      <IndividualTrackerViewer
        trackerGamertag="Chief"
        connectionStatus="connected"
        errorMessage={null}
        canManage={true}
        refreshInProgress={false}
        refreshStartedAt={null}
        refreshPending={false}
        refreshMessage={null}
        trackerSummary={aTrackerSummaryWith()}
        renderModel={aRenderModelWith()}
        topBarStats={aTopBarStatsWith()}
        matchHistoryLoading={false}
        onBackToManage={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("Won:Loss")).toBeInTheDocument();
    expect(screen.getByText("2:1")).toBeInTheDocument();
    expect(screen.getByText("Current Rank")).toBeInTheDocument();
    expect(screen.getByText("Onyx (1500)")).toBeInTheDocument();
  });

  it("shows updating status while active tracker data is refreshing", () => {
    render(
      <IndividualTrackerViewer
        trackerGamertag="Chief"
        connectionStatus="connected"
        errorMessage={null}
        canManage={true}
        refreshInProgress={false}
        refreshStartedAt={null}
        refreshPending={false}
        refreshMessage={null}
        trackerSummary={aTrackerSummaryWith()}
        renderModel={aRenderModelWith()}
        topBarStats={aTopBarStatsWith()}
        matchHistoryLoading={true}
        onBackToManage={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("updating")).toBeInTheDocument();
  });
});
