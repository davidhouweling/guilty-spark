import "@testing-library/jest-dom/vitest";

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TeamColor } from "../../team-colors/team-colors";
import { LiveTrackerProvider } from "../live-tracker-context";
import type { LiveTrackerViewModel } from "../types";

vi.mock("../live-tracker-context", async () => {
  const actual = await vi.importActual("../live-tracker-context");
  return {
    ...actual,
  };
});

vi.mock("../../view-mode/view-mode-selector", () => ({
  ViewModeSelector: (): React.ReactNode => <div data-testid="view-mode-selector">View Mode Selector</div>,
}));

vi.mock("../../stats/match-stats", () => ({
  MatchStats: (): React.ReactNode => <div data-testid="match-stats">Match Stats</div>,
}));

vi.mock("../../stats/series-stats", () => ({
  SeriesStats: (): React.ReactNode => <div data-testid="series-stats">Series Stats</div>,
}));

vi.mock("../../information-ticker/information-ticker", () => ({
  InformationTicker: (): React.ReactNode => <div data-testid="information-ticker">Information Ticker</div>,
}));

vi.mock("../../player-pre-series-info/player-pre-series-info", () => ({
  PlayerPreSeriesInfo: (): React.ReactNode => <div data-testid="player-pre-series-info">Player Pre Series Info</div>,
}));

vi.mock("../../scrolling-content/scrolling-content", () => ({
  ScrollingContent: ({ children }: { children: React.ReactNode }): React.ReactNode => (
    <div data-testid="scrolling-content">{children}</div>
  ),
}));

vi.mock("../../icons/rank-icon", () => ({
  RankIcon: (): React.ReactNode => <div data-testid="rank-icon">Rank</div>,
}));

const { StreamerOverlay } = await import("../streamer-overlay");

const defaultParams = { type: "team" as const, server: "test-server", queue: "5" };

function aFakeLiveTrackerViewModelWith(overrides?: Partial<LiveTrackerViewModel>): LiveTrackerViewModel {
  return {
    guildNameText: "Test Guild",
    queueNumberText: "Queue 5",
    statusText: "active",
    statusClassName: "status-active",
    state: {
      type: "neatqueue",
      guildName: "Test Guild",
      queueNumber: 5,
      status: "active",
      lastUpdateTime: "2025-01-01T00:00:00.000Z",
      teams: [
        {
          name: "Team 1",
          players: [{ id: "player1", displayName: "player_one" }],
        },
      ],
      matches: [],
      substitutions: [],
      seriesScore: "0:0",
      medalMetadata: {},
      playersAssociationData: {},
    },
    ...overrides,
  };
}

describe("StreamerOverlay", () => {
  const teamColors: TeamColor[] = [
    { id: "eagle", name: "Eagle", hex: "#0066CC" },
    { id: "cobra", name: "Cobra", hex: "#CC0000" },
  ];

  const gameModeIconUrl = (gameMode: string): string => `https://example.com/icons/${gameMode}.png`;

  const defaultProps = {
    teamColors,
    gameModeIconUrl,
    viewMode: "streamer" as const,
    onViewModeSelect: vi.fn(),
    previewMode: "none" as const,
    onPreviewModeSelect: vi.fn(),
    streamerOptions: {
      primaryTeamIndex: 0,
      displayMode: "team" as const,
      showTeams: true,
      showTicker: false,
      showTabs: true,
      showServerName: true,
    },
    onStreamerOptionsChange: vi.fn(),
  };

  it("renders no data message when state is null", () => {
    const model = aFakeLiveTrackerViewModelWith({ state: null });

    render(
      <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
        <StreamerOverlay {...defaultProps} />
      </LiveTrackerProvider>,
    );

    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("renders streamer overlay with view mode selector", () => {
    const model = aFakeLiveTrackerViewModelWith();

    render(
      <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
        <StreamerOverlay {...defaultProps} />
      </LiveTrackerProvider>,
    );

    expect(screen.getAllByTestId("view-mode-selector").length).toBeGreaterThan(0);
  });

  it("renders information ticker when showTicker is enabled and matches exist", () => {
    const model = aFakeLiveTrackerViewModelWith({
      state: {
        type: "neatqueue",
        guildName: "Test Guild",
        queueNumber: 5,
        status: "active",
        lastUpdateTime: "2025-01-01T00:00:00.000Z",
        teams: [
          { name: "Team 1", players: [{ id: "player1", displayName: "player_one" }] },
          { name: "Team 2", players: [{ id: "player2", displayName: "player_two" }] },
        ],
        matches: [
          {
            matchId: "match1",
            gameTypeAndMap: "Slayer: Aquarius",
            gameType: "Slayer",
            gameMap: "Aquarius",
            gameMapThumbnailUrl: "data:,",
            duration: "10m 0s",
            gameScore: "50:49",
            gameSubScore: null,
            startTime: "2024-12-31T23:50:00.000Z",
            endTime: "2025-01-01T00:00:00.000Z",
            rawMatchStats: null,
            playerXuidToGametag: {},
          },
        ],
        substitutions: [],
        seriesScore: "1:0",
        medalMetadata: {},
        playersAssociationData: null,
      },
    });

    const allMatchStats = [
      {
        matchId: "match1",
        data: [
          {
            teamId: 0,
            teamStats: [],
            players: [
              {
                name: "Player One",
                values: [],
                medals: [],
              },
            ],
            teamMedals: [],
          },
        ],
      },
    ];

    render(
      <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={allMatchStats} seriesStats={null}>
        <StreamerOverlay
          {...defaultProps}
          previewMode="none"
          streamerOptions={{ ...defaultProps.streamerOptions, showTicker: true }}
        />
      </LiveTrackerProvider>,
    );

    expect(screen.getAllByTestId("information-ticker").length).toBeGreaterThan(0);
  });

  it("renders with matches data", () => {
    const model = aFakeLiveTrackerViewModelWith({
      state: {
        type: "neatqueue",
        guildName: "Test Guild",
        queueNumber: 5,
        status: "active",
        lastUpdateTime: "2025-01-01T00:00:00.000Z",
        teams: [
          { name: "Team 1", players: [{ id: "player1", displayName: "player_one" }] },
          { name: "Team 2", players: [{ id: "player2", displayName: "player_two" }] },
        ],
        matches: [
          {
            matchId: "match1",
            gameTypeAndMap: "Slayer: Aquarius",
            gameType: "Slayer",
            gameMap: "Aquarius",
            gameMapThumbnailUrl: "data:,",
            duration: "10m 0s",
            gameScore: "50:49",
            gameSubScore: null,
            startTime: "2024-12-31T23:50:00.000Z",
            endTime: "2025-01-01T00:00:00.000Z",
            rawMatchStats: null,
            playerXuidToGametag: {},
          },
        ],
        substitutions: [],
        seriesScore: "1:0",
        medalMetadata: {},
        playersAssociationData: null,
      },
    });

    const allMatchStats = [{ matchId: "match1", data: null }];

    render(
      <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={allMatchStats} seriesStats={null}>
        <StreamerOverlay {...defaultProps} />
      </LiveTrackerProvider>,
    );

    expect(screen.getAllByTestId("view-mode-selector").length).toBeGreaterThan(0);
  });
});
