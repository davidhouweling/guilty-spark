import "@testing-library/jest-dom/vitest";

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TeamColor } from "../../team-colors/team-colors";
import type { StreamerOverlayProps } from "../streamer-overlay";
import { LiveTrackerProvider } from "../live-tracker-context";
import type { LiveTrackerViewModel } from "../types";
import { DEFAULT_ALL_SETTINGS } from "../settings/types";

vi.mock("../live-tracker-context", async () => {
  const actual = await vi.importActual("../live-tracker-context");
  return {
    ...actual,
  };
});

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

// Mock TeamIcon to avoid PNG import issues in tests
vi.mock("../../icons/team-icon", () => ({
  TeamIcon: (): React.ReactNode => <div data-testid="team-icon">Team</div>,
}));

const { StreamerOverlay } = await import("../streamer-overlay");

const defaultParams = { type: "team" as const, server: "test-server", queue: "5" };

function aFakeLiveTrackerViewModelWith(overrides?: Partial<LiveTrackerViewModel>): LiveTrackerViewModel {
  return {
    title: "Test Guild",
    subTitle: "Queue 5",
    iconUrl: "data:,",
    statusText: "active",
    statusClassName: "status-active",
    state: {
      type: "neatqueue",
      guildName: "Test Guild",
      guildId: "test-guild-id",
      guildIcon: "data:,",
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

  const defaultProps: StreamerOverlayProps = {
    teamColors,
    gameModeIconUrl,
    settings: DEFAULT_ALL_SETTINGS,
    settingsUi: <div>Settings UI</div>,
  };

  it("renders no data message when state is null", () => {
    const model = aFakeLiveTrackerViewModelWith({ state: null });

    render(
      <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
        <StreamerOverlay {...defaultProps} />
      </LiveTrackerProvider>,
    );

    expect(screen.getByText("Streamer overlay is only available for NeatQueue trackers")).toBeInTheDocument();
  });

  it("renders streamer overlay with settings UI", () => {
    const model = aFakeLiveTrackerViewModelWith();

    render(
      <LiveTrackerProvider params={defaultParams} model={model} allMatchStats={[]} seriesStats={null}>
        <StreamerOverlay {...defaultProps} />
      </LiveTrackerProvider>,
    );

    expect(screen.getByText("Settings UI")).toBeInTheDocument();
    expect(screen.getByText("Test Guild")).toBeInTheDocument();
  });

  it("renders information ticker when showTicker is enabled and matches exist", () => {
    const model = aFakeLiveTrackerViewModelWith({
      state: {
        type: "neatqueue",
        guildName: "Test Guild",
        guildId: "test-guild-id",
        guildIcon: "data:,",
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
        <StreamerOverlay {...defaultProps} />
      </LiveTrackerProvider>,
    );

    expect(screen.getAllByTestId("information-ticker").length).toBeGreaterThan(0);
  });

  it("renders with matches data", () => {
    const model = aFakeLiveTrackerViewModelWith({
      state: {
        type: "neatqueue",
        guildName: "Test Guild",
        guildId: "test-guild-id",
        guildIcon: "data:,",
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

    expect(screen.getAllByText("Test Guild").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Series score").length).toBeGreaterThan(0);
  });
});
