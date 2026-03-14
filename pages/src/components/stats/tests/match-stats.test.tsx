import "@testing-library/jest-dom/vitest";

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { MatchStats } from "../match-stats";
import { aFakeMatchStatsDataWith, aFakeMatchStatsPlayerDataWith } from "../fakes/component-data";
import type { TeamColor } from "../../team-colors/team-colors";

afterEach(() => {
  cleanup();
});

vi.mock("../../icons/team-icon", () => ({
  TeamIcon: ({ teamId }: { teamId: number }): React.ReactNode => (
    <div data-testid={`team-icon-${teamId.toString()}`}>Team {teamId.toString()}</div>
  ),
}));

vi.mock("../../icons/medal-icon", () => ({
  MedalIcon: ({ medalName }: { medalName: string }): React.ReactNode => (
    <div data-testid={`medal-icon-${medalName}`}>{medalName}</div>
  ),
}));

describe("MatchStats", () => {
  const teamColors: TeamColor[] = [
    { id: "eagle", name: "Eagle", hex: "#0066CC" },
    { id: "cobra", name: "Cobra", hex: "#CC0000" },
  ];

  it("renders match header with title and metadata", () => {
    const data = [aFakeMatchStatsDataWith({ teamId: 0 }), aFakeMatchStatsDataWith({ teamId: 1 })];

    render(
      <MatchStats
        data={data}
        id="match-1"
        backgroundImageUrl="https://example.com/bg.jpg"
        gameModeIconUrl="https://example.com/icon.png"
        gameModeAlt="Slayer"
        matchNumber={1}
        gameTypeAndMap="Slayer: Aquarius"
        duration="10m 30s"
        score="50:49"
        startTime="2024-01-01T00:00:00.000Z"
        endTime="2024-01-01T00:10:30.000Z"
      />,
    );

    expect(screen.getByText(/Match 1: Slayer: Aquarius/)).toBeInTheDocument();
    expect(screen.getByText(/50:49/)).toBeInTheDocument();
    expect(screen.getByText(/10m 30s/)).toBeInTheDocument();
  });

  it("renders team totals table when team stats are present", () => {
    const data = [aFakeMatchStatsDataWith({ teamId: 0 }), aFakeMatchStatsDataWith({ teamId: 1 })];

    render(
      <MatchStats
        data={data}
        id="match-1"
        backgroundImageUrl="https://example.com/bg.jpg"
        gameModeIconUrl="https://example.com/icon.png"
        gameModeAlt="Slayer"
        matchNumber={1}
        gameTypeAndMap="Slayer: Aquarius"
        duration="10m 30s"
        score="50:49"
        startTime="2024-01-01T00:00:00.000Z"
        endTime="2024-01-01T00:10:30.000Z"
      />,
    );

    const teamTotalsElements = screen.getAllByText("Team Totals");
    expect(teamTotalsElements.length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Team statistics")).toBeInTheDocument();
  });

  it("does not render team totals when no team stats are present", () => {
    const data = [aFakeMatchStatsDataWith({ teamId: 0, teamStats: [] })];

    render(
      <MatchStats
        data={data}
        id="match-1"
        backgroundImageUrl="https://example.com/bg.jpg"
        gameModeIconUrl="https://example.com/icon.png"
        gameModeAlt="Slayer"
        matchNumber={1}
        gameTypeAndMap="Slayer: Aquarius"
        duration="10m 30s"
        score="50:49"
        startTime="2024-01-01T00:00:00.000Z"
        endTime="2024-01-01T00:10:30.000Z"
      />,
    );

    const teamTotalsElements = screen.queryAllByText("Team Totals");
    expect(teamTotalsElements).toHaveLength(0);
  });

  it("renders player stats table", () => {
    const data = [
      aFakeMatchStatsDataWith({
        teamId: 0,
        players: [
          aFakeMatchStatsPlayerDataWith({ name: "PlayerAlpha" }),
          aFakeMatchStatsPlayerDataWith({ name: "PlayerBeta" }),
        ],
      }),
    ];

    render(
      <MatchStats
        data={data}
        id="match-1"
        backgroundImageUrl="https://example.com/bg.jpg"
        gameModeIconUrl="https://example.com/icon.png"
        gameModeAlt="Slayer"
        matchNumber={1}
        gameTypeAndMap="Slayer: Aquarius"
        duration="10m 30s"
        score="50:49"
        startTime="2024-01-01T00:00:00.000Z"
        endTime="2024-01-01T00:10:30.000Z"
      />,
    );

    const playersElements = screen.getAllByText("Players");
    expect(playersElements.length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Player statistics")).toBeInTheDocument();
    expect(screen.getByText("PlayerAlpha")).toBeInTheDocument();
    expect(screen.getByText("PlayerBeta")).toBeInTheDocument();
  });

  it("formats start and end times as locale strings", () => {
    const data = [aFakeMatchStatsDataWith({ teamId: 0 })];
    const startTime = "2024-01-15T14:30:00.000Z";
    const endTime = "2024-01-15T14:45:00.000Z";

    render(
      <MatchStats
        data={data}
        id="match-1"
        backgroundImageUrl="https://example.com/bg.jpg"
        gameModeIconUrl="https://example.com/icon.png"
        gameModeAlt="Slayer"
        matchNumber={1}
        gameTypeAndMap="Slayer: Aquarius"
        duration="15m 0s"
        score="50:49"
        startTime={startTime}
        endTime={endTime}
      />,
    );

    const expectedStartTime = new Date(startTime).toLocaleString();
    const expectedEndTime = new Date(endTime).toLocaleString();

    expect(screen.getByText(expectedStartTime)).toBeInTheDocument();
    expect(screen.getByText(expectedEndTime)).toBeInTheDocument();
  });

  it("applies team colors to table rows when provided", () => {
    const data = [aFakeMatchStatsDataWith({ teamId: 0 }), aFakeMatchStatsDataWith({ teamId: 1 })];

    const { container } = render(
      <MatchStats
        data={data}
        id="match-1"
        backgroundImageUrl="https://example.com/bg.jpg"
        gameModeIconUrl="https://example.com/icon.png"
        gameModeAlt="Slayer"
        matchNumber={1}
        gameTypeAndMap="Slayer: Aquarius"
        duration="10m 30s"
        score="50:49"
        startTime="2024-01-01T00:00:00.000Z"
        endTime="2024-01-01T00:10:30.000Z"
        teamColors={teamColors}
      />,
    );

    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("renders with game mode icon", () => {
    const data = [aFakeMatchStatsDataWith({ teamId: 0 })];

    render(
      <MatchStats
        data={data}
        id="match-1"
        backgroundImageUrl="https://example.com/bg.jpg"
        gameModeIconUrl="https://example.com/icon.png"
        gameModeAlt="Slayer Mode"
        matchNumber={1}
        gameTypeAndMap="Slayer: Aquarius"
        duration="10m 30s"
        score="50:49"
        startTime="2024-01-01T00:00:00.000Z"
        endTime="2024-01-01T00:10:30.000Z"
      />,
    );

    const icon = screen.getByAltText("Slayer Mode");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("src", "https://example.com/icon.png");
  });
});
