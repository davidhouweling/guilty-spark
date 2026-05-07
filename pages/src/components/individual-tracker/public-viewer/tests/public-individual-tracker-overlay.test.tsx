import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PublicViewerSnapshot } from "../types";
import { PublicIndividualTrackerOverlay } from "../public-individual-tracker-overlay";
import { aFakeIndividualTrackerStateWith } from "../../../../services/individual-tracker/fakes/individual-tracker.fake";
import type { IndividualTrackerViewerRenderModel, OverlayTab } from "../../types";

afterEach(() => {
  cleanup();
});

function aRenderModelWithSeries(): IndividualTrackerViewerRenderModel {
  return {
    lastUpdatedTime: new Date().toISOString(),
    trackerStatus: "active",
    accumulatedStats: {
      total: 1,
      wins: 1,
      losses: 0,
      ties: 0,
      customOrLocal: 0,
      matchmaking: 1,
      groupedSeries: 1,
      standalone: 0,
    },
    teamColors: [],
    activeNeatQueueSeries: {
      title: "Grand Finals",
      subtitle: "Queue #77",
      seriesScore: "2:1",
      teams: [
        {
          name: "Blue",
          players: [
            { id: "p1", displayName: "Alpha" },
            { id: "p2", displayName: "Bravo" },
          ],
        },
        {
          name: "Red",
          players: [
            { id: "p3", displayName: "Charlie" },
            { id: "p4", displayName: "Delta" },
          ],
        },
      ],
      playersAssociationData: {},
      substitutions: [],
    },
    trackedPlayerTotals: null,
    gameplayTimeline: [
      {
        type: "group",
        id: "group-1",
        title: "Set A",
        subtitle: "Best of 3",
        seriesScore: "2:1",
        overviewMatches: [],
        teams: [],
        seriesTotals: null,
        matches: [],
      },
    ],
    trackedEntriesCount: 1,
  };
}

function aRenderModelWithoutSeries(): IndividualTrackerViewerRenderModel {
  return {
    ...aRenderModelWithSeries(),
    activeNeatQueueSeries: null,
    gameplayTimeline: [
      {
        type: "match",
        id: "match-1",
        match: {
          id: "match-1",
          matchStats: null,
          backgroundImageUrl: "",
          gameMode: "Slayer",
          matchNumber: 1,
          gameTypeAndMap: "Slayer on Aquarius",
          duration: "12m 00s",
          score: "50:48",
          startTime: "10:10",
          endTime: "10:22",
        },
      },
    ],
    accumulatedStats: {
      total: 1,
      wins: 1,
      losses: 0,
      ties: 0,
      customOrLocal: 0,
      matchmaking: 1,
      groupedSeries: 0,
      standalone: 1,
    },
  };
}

function aSnapshotWith(overrides: Partial<PublicViewerSnapshot> = {}): PublicViewerSnapshot {
  const defaultTabs: readonly OverlayTab[] = [
    {
      id: "series",
      label: "Series",
      type: "active-series",
      teamColor: "#00B7EB",
    },
  ];

  return {
    xuid: "2533274844642438",
    variant: "overlay",
    loading: false,
    availability: "active",
    connectionStatus: "connected",
    errorMessage: null,
    trackerState: aFakeIndividualTrackerStateWith({ gamertag: "Chief" }),
    trackerSummary: null,
    matchHistory: null,
    matchHistoryLoading: false,
    renderModel: aRenderModelWithSeries(),
    viewerTeamColor: "salmon",
    viewerEnemyColor: "cerulean",
    overlayShowTabs: true,
    overlayShowTicker: true,
    overlayShowTeamDetails: true,
    overlayColorMode: "observer",
    overlayTabs: defaultTabs,
    overlayAccumulatedStats: {
      wins: 1,
      losses: 0,
      total: 1,
      matchmaking: 1,
      custom: 0,
    },
    overlayTickerGroups: [],
    xuidToDiscordName: {},
    overlayShowMatchmakingStatsOnly: false,
    overlaySelectedSlayerStats: ["Score", "Kills"],
    overlayShowObjectiveStats: false,
    overlayMedalRarityFilter: [2, 3],
    overlayShowPreSeriesInfo: true,
    overlayFontSizes: {
      queueInfo: 100,
      score: 100,
      teams: 100,
      tabs: 100,
      ticker: 100,
    },
    overlayShowTitle: true,
    overlayShowSubtitle: true,
    overlayShowScore: true,
    overlayShowDiscordNames: true,
    overlayShowXboxNames: true,
    overlayTopBarStatSlots: [
      "games-win-loss",
      "series-win-loss",
      "kills-deaths-assists-kda",
      "damage-dealt-taken-ratio",
      "avg-life-damage-per-life",
      "current-rank",
    ],
    ...overrides,
  };
}

describe("PublicIndividualTrackerOverlay", () => {
  it("shows minimal mark for inactive overlay states", () => {
    render(<PublicIndividualTrackerOverlay snapshot={aSnapshotWith({ availability: "offline" })} />);

    expect(screen.getByLabelText(/guilty spark overlay mark/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /chief overlay/i })).not.toBeInTheDocument();
  });

  it("renders series tab and team details when active series exists", () => {
    render(<PublicIndividualTrackerOverlay snapshot={aSnapshotWith()} />);

    expect(screen.getByRole("button", { name: "Series" })).toBeInTheDocument();
    expect(screen.getByText("Grand Finals")).toBeInTheDocument();
    expect(screen.getAllByText("Blue").length).toBeGreaterThan(0);
  });

  it("renders match-first tabs when no active series exists", () => {
    render(
      <PublicIndividualTrackerOverlay
        snapshot={aSnapshotWith({
          renderModel: aRenderModelWithoutSeries(),
          overlayTabs: [
            {
              id: "standalone-0",
              label: "Game 1",
              type: "standalone",
              teamColor: "#00B7EB",
              timelineIndex: 0,
            },
          ],
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: "Series" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Game 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Game 1" }));
    expect(screen.getByText(/slayer on aquarius/i)).toBeInTheDocument();
  });

  it("hides tab controls when streamer settings disable tabs", () => {
    render(<PublicIndividualTrackerOverlay snapshot={aSnapshotWith({ overlayShowTabs: false })} />);

    expect(screen.queryByRole("button", { name: "Series" })).not.toBeInTheDocument();
    expect(screen.getByText("Grand Finals")).toBeInTheDocument();
  });

  it("hides ticker text when streamer settings disable ticker", () => {
    render(<PublicIndividualTrackerOverlay snapshot={aSnapshotWith({ overlayShowTicker: false })} />);

    expect(screen.queryByText(/live tracker connected/i)).not.toBeInTheDocument();
  });

  it("hides team details when streamer settings disable team details", () => {
    render(<PublicIndividualTrackerOverlay snapshot={aSnapshotWith({ overlayShowTeamDetails: false })} />);

    expect(screen.queryByText("Blue")).not.toBeInTheDocument();
  });

  it("shows overlay status with player mode when requested", () => {
    render(<PublicIndividualTrackerOverlay snapshot={aSnapshotWith({ overlayColorMode: "player" })} />);

    expect(screen.getByText(/player mode/i)).toBeInTheDocument();
  });

  it("renders accumulated stats in top bar for non-series sessions", () => {
    render(
      <PublicIndividualTrackerOverlay
        snapshot={aSnapshotWith({
          renderModel: aRenderModelWithoutSeries(),
          overlayTabs: [
            {
              id: "standalone-0",
              label: "Game 1",
              type: "standalone",
              teamColor: "#00B7EB",
              timelineIndex: 0,
            },
          ],
          overlayAccumulatedStats: {
            wins: 7,
            losses: 4,
            total: 11,
            matchmaking: 10,
            custom: 1,
          },
          overlayTopBarStatSlots: [
            "games-win-loss",
            "total-games",
            "matchmaking-games",
            "custom-local-games",
            "series-win-loss",
            "current-rank",
          ],
        })}
      />,
    );

    expect(screen.getByText("7W:4L")).toBeInTheDocument();
    expect(screen.getByText("11 Total")).toBeInTheDocument();
    expect(screen.getByText("10 Matchmaking")).toBeInTheDocument();
    expect(screen.getByText("1 Custom/Local")).toBeInTheDocument();
  });
});
