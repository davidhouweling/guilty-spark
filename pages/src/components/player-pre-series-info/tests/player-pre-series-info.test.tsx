import "@testing-library/jest-dom/vitest";

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { PlayerAssociationData } from "@guilty-spark/shared/live-tracker/types";

import { PlayerPreSeriesInfo } from "../player-pre-series-info";
import type { TeamColor } from "../../team-colors/team-colors";

afterEach(() => {
  cleanup();
});

vi.mock("../../icons/team-icon", () => ({
  TeamIcon: ({ teamId }: { teamId: number }): React.ReactNode => (
    <div data-testid={`team-icon-${teamId.toString()}`}>Team {teamId.toString()}</div>
  ),
}));

vi.mock("../../icons/rank-icon", () => ({
  RankIcon: (): React.ReactNode => <div data-testid="rank-icon">Rank</div>,
}));

vi.mock("react-time-ago", () => ({
  default: ({ date }: { date: Date }): React.ReactNode => <span>{date.toISOString()}</span>,
}));

function aFakePlayerAssociationDataWith(overrides?: Partial<PlayerAssociationData>): PlayerAssociationData {
  return {
    discordId: "123456789",
    discordName: "TestPlayer",
    xboxId: "987654321",
    gamertag: "TestGamer",
    currentRank: 1500,
    currentRankTier: "Onyx",
    currentRankSubTier: 0,
    currentRankMeasurementMatchesRemaining: null,
    currentRankInitialMeasurementMatches: null,
    allTimePeakRank: 1600,
    esra: 1550,
    lastRankedGamePlayed: "2024-01-15T12:00:00.000Z",
    ...overrides,
  };
}

describe("PlayerPreSeriesInfo", () => {
  const teamColors: TeamColor[] = [
    { id: "eagle", name: "Eagle", hex: "#0066CC" },
    { id: "cobra", name: "Cobra", hex: "#CC0000" },
  ];

  const teams = [
    {
      name: "Eagle",
      players: [
        { id: "player1", displayName: "Player One" },
        { id: "player2", displayName: "Player Two" },
      ],
    },
    {
      name: "Cobra",
      players: [
        { id: "player3", displayName: "Player Three" },
        { id: "player4", displayName: "Player Four" },
      ],
    },
  ];

  it("renders player info title", () => {
    const playersAssociationData = {
      player1: aFakePlayerAssociationDataWith({ discordName: "Player One" }),
    };

    render(
      <PlayerPreSeriesInfo playersAssociationData={playersAssociationData} teams={teams} teamColors={teamColors} />,
    );

    expect(screen.getByText("Player Info")).toBeInTheDocument();
  });

  it("renders player table with data", () => {
    const playersAssociationData = {
      player1: aFakePlayerAssociationDataWith({
        discordName: "Player One",
        gamertag: "GamerOne",
      }),
      player2: aFakePlayerAssociationDataWith({
        discordName: "Player Two",
        gamertag: "GamerTwo",
      }),
    };

    render(
      <PlayerPreSeriesInfo playersAssociationData={playersAssociationData} teams={teams} teamColors={teamColors} />,
    );

    expect(screen.getByLabelText("Player information")).toBeInTheDocument();
    expect(screen.getByText("Player One")).toBeInTheDocument();
    expect(screen.getByText("Player Two")).toBeInTheDocument();
    expect(screen.getByText("GamerOne")).toBeInTheDocument();
    expect(screen.getByText("GamerTwo")).toBeInTheDocument();
  });

  it("displays Not connected for players without gamertags", () => {
    const playersAssociationData = {
      player1: aFakePlayerAssociationDataWith({
        discordName: "Player One",
        gamertag: null,
      }),
    };

    render(
      <PlayerPreSeriesInfo playersAssociationData={playersAssociationData} teams={teams} teamColors={teamColors} />,
    );

    expect(screen.getByText("Not connected")).toBeInTheDocument();
  });

  it("renders rank information for players", () => {
    const playersAssociationData = {
      player1: aFakePlayerAssociationDataWith({
        discordName: "Player One",
        currentRank: 1500,
        currentRankTier: "Onyx",
        currentRankSubTier: 0,
      }),
    };

    render(
      <PlayerPreSeriesInfo playersAssociationData={playersAssociationData} teams={teams} teamColors={teamColors} />,
    );

    expect(screen.getByText("1,500")).toBeInTheDocument();
  });

  it("displays dash for null rank values", () => {
    const playersAssociationData = {
      player1: aFakePlayerAssociationDataWith({
        discordName: "Player One",
        currentRank: null,
        currentRankTier: null,
      }),
    };

    render(
      <PlayerPreSeriesInfo playersAssociationData={playersAssociationData} teams={teams} teamColors={teamColors} />,
    );

    const table = screen.getByLabelText("Player information");
    expect(table).toBeInTheDocument();
  });

  it("renders peak rank with calculated tier", () => {
    const playersAssociationData = {
      player1: aFakePlayerAssociationDataWith({
        discordName: "Player One",
        allTimePeakRank: 1600,
      }),
    };

    render(
      <PlayerPreSeriesInfo playersAssociationData={playersAssociationData} teams={teams} teamColors={teamColors} />,
    );

    expect(screen.getByText("1,600")).toBeInTheDocument();
  });

  it("renders ESRA with calculated tier", () => {
    const playersAssociationData = {
      player1: aFakePlayerAssociationDataWith({
        discordName: "Player One",
        esra: 1234.56,
      }),
    };

    render(
      <PlayerPreSeriesInfo playersAssociationData={playersAssociationData} teams={teams} teamColors={teamColors} />,
    );

    expect(screen.getByText("1,235")).toBeInTheDocument();
  });

  it("renders relative time for last ranked game played", () => {
    const playersAssociationData = {
      player1: aFakePlayerAssociationDataWith({
        discordName: "Player One",
        lastRankedGamePlayed: "2024-01-15T12:00:00.000Z",
      }),
    };

    render(
      <PlayerPreSeriesInfo playersAssociationData={playersAssociationData} teams={teams} teamColors={teamColors} />,
    );

    expect(screen.getByText("Last ranked match played")).toBeInTheDocument();
  });

  it("displays dash when last ranked game played is null", () => {
    const playersAssociationData = {
      player1: aFakePlayerAssociationDataWith({
        discordName: "Player One",
        lastRankedGamePlayed: null,
      }),
    };

    render(
      <PlayerPreSeriesInfo playersAssociationData={playersAssociationData} teams={teams} teamColors={teamColors} />,
    );

    const cells = screen.getAllByRole("cell");
    const dashCells = cells.filter((cell) => cell.textContent === "-");
    expect(dashCells.length).toBeGreaterThan(0);
  });

  it("only renders players that exist in playersAssociationData", () => {
    const playersAssociationData = {
      player1: aFakePlayerAssociationDataWith({ discordName: "Player One" }),
    };

    render(
      <PlayerPreSeriesInfo playersAssociationData={playersAssociationData} teams={teams} teamColors={teamColors} />,
    );

    expect(screen.getByText("Player One")).toBeInTheDocument();
    expect(screen.queryByText("Player Two")).not.toBeInTheDocument();
    expect(screen.queryByText("Player Three")).not.toBeInTheDocument();
  });

  it("applies team colors to table rows", () => {
    const playersAssociationData = {
      player1: aFakePlayerAssociationDataWith({ discordName: "Player One" }),
      player3: aFakePlayerAssociationDataWith({ discordName: "Player Three" }),
    };

    const { container } = render(
      <PlayerPreSeriesInfo playersAssociationData={playersAssociationData} teams={teams} teamColors={teamColors} />,
    );

    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);
  });

  it("sorts by team initially", () => {
    const playersAssociationData = {
      player1: aFakePlayerAssociationDataWith({ discordName: "Eagle Player" }),
      player3: aFakePlayerAssociationDataWith({ discordName: "Cobra Player" }),
    };

    render(
      <PlayerPreSeriesInfo playersAssociationData={playersAssociationData} teams={teams} teamColors={teamColors} />,
    );

    expect(screen.getByLabelText("Player information")).toBeInTheDocument();
  });

  it("renders all column headers", () => {
    const playersAssociationData = {
      player1: aFakePlayerAssociationDataWith({ discordName: "Player One" }),
    };

    render(
      <PlayerPreSeriesInfo playersAssociationData={playersAssociationData} teams={teams} teamColors={teamColors} />,
    );

    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("Discord Name")).toBeInTheDocument();
    expect(screen.getByText("Gamertag")).toBeInTheDocument();
    expect(screen.getByText("Current Rank")).toBeInTheDocument();
    expect(screen.getByText("Peak Rank")).toBeInTheDocument();
    expect(screen.getByText("ESRA")).toBeInTheDocument();
    expect(screen.getByText("Last ranked match played")).toBeInTheDocument();
  });
});
