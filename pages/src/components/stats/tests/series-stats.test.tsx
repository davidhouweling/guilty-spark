import "@testing-library/jest-dom/vitest";

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { SeriesStats } from "../series-stats";
import { aFakeMatchStatsDataWith, aFakeMatchStatsPlayerDataWith } from "../fakes/component-data";
import type { SeriesMetadata } from "../series-metadata";
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

describe("SeriesStats", () => {
  const teamColors: TeamColor[] = [
    { id: "eagle", name: "Eagle", hex: "#0066CC" },
    { id: "cobra", name: "Cobra", hex: "#CC0000" },
  ];

  const seriesMetadata: SeriesMetadata = {
    score: "3:2",
    duration: "45m 30s",
    startTime: "2024-01-01T00:00:00.000Z",
    endTime: "2024-01-01T00:45:30.000Z",
  };

  it("renders series title", () => {
    const teamData = [aFakeMatchStatsDataWith({ teamId: 0 })];
    const playerData = [aFakeMatchStatsDataWith({ teamId: 0 })];

    render(
      <SeriesStats teamData={teamData} playerData={playerData} title="Series Overview" metadata={seriesMetadata} />,
    );

    expect(screen.getByText("Series Overview")).toBeInTheDocument();
  });

  it("renders series metadata when provided", () => {
    const teamData = [aFakeMatchStatsDataWith({ teamId: 0 })];
    const playerData = [aFakeMatchStatsDataWith({ teamId: 0 })];

    render(
      <SeriesStats teamData={teamData} playerData={playerData} title="Series Overview" metadata={seriesMetadata} />,
    );

    const scoreElements = screen.getAllByText(/3:2/);
    expect(scoreElements.length).toBeGreaterThan(0);
    const durationElements = screen.getAllByText(/45m 30s/);
    expect(durationElements.length).toBeGreaterThan(0);
  });

  it("does not render metadata when null", () => {
    const teamData = [aFakeMatchStatsDataWith({ teamId: 0 })];
    const playerData = [aFakeMatchStatsDataWith({ teamId: 0 })];

    render(<SeriesStats teamData={teamData} playerData={playerData} title="Series Overview" metadata={null} />);

    const scoreLabels = screen.queryAllByText(/Score:/);
    const durationLabels = screen.queryAllByText(/Duration:/);
    expect(scoreLabels).toHaveLength(0);
    expect(durationLabels).toHaveLength(0);
  });

  it("renders accumulated team stats table when team stats are present", () => {
    const teamData = [aFakeMatchStatsDataWith({ teamId: 0 }), aFakeMatchStatsDataWith({ teamId: 1 })];
    const playerData = [aFakeMatchStatsDataWith({ teamId: 0 })];

    render(
      <SeriesStats teamData={teamData} playerData={playerData} title="Series Overview" metadata={seriesMetadata} />,
    );

    const teamStatsElements = screen.getAllByText("Accumulated Team Stats");
    expect(teamStatsElements.length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Accumulated team statistics")).toBeInTheDocument();
  });

  it("does not render team stats when no team stats are present", () => {
    const teamData = [aFakeMatchStatsDataWith({ teamId: 0, teamStats: [] })];
    const playerData = [aFakeMatchStatsDataWith({ teamId: 0 })];

    render(
      <SeriesStats teamData={teamData} playerData={playerData} title="Series Overview" metadata={seriesMetadata} />,
    );

    const teamStatsElements = screen.queryAllByText("Accumulated Team Stats");
    expect(teamStatsElements).toHaveLength(0);
  });

  it("renders accumulated player stats table when player stats are present", () => {
    const teamData = [aFakeMatchStatsDataWith({ teamId: 0 })];
    const playerData = [
      aFakeMatchStatsDataWith({
        teamId: 0,
        players: [
          aFakeMatchStatsPlayerDataWith({ name: "Player1" }),
          aFakeMatchStatsPlayerDataWith({ name: "Player2" }),
        ],
      }),
    ];

    render(
      <SeriesStats teamData={teamData} playerData={playerData} title="Series Overview" metadata={seriesMetadata} />,
    );

    const playerStatsElements = screen.getAllByText("Accumulated Player Stats");
    expect(playerStatsElements.length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Accumulated player statistics")).toBeInTheDocument();
    expect(screen.getByText("Player1")).toBeInTheDocument();
    expect(screen.getByText("Player2")).toBeInTheDocument();
  });

  it("does not render player stats when no player stats are present", () => {
    const teamData = [aFakeMatchStatsDataWith({ teamId: 0 })];
    const playerData = [aFakeMatchStatsDataWith({ teamId: 0, players: [] })];

    render(
      <SeriesStats teamData={teamData} playerData={playerData} title="Series Overview" metadata={seriesMetadata} />,
    );

    const playerStatsElements = screen.queryAllByText("Accumulated Player Stats");
    expect(playerStatsElements).toHaveLength(0);
  });

  it("formats metadata times as locale strings", () => {
    const teamData = [aFakeMatchStatsDataWith({ teamId: 0 })];
    const playerData = [aFakeMatchStatsDataWith({ teamId: 0 })];
    const metadata: SeriesMetadata = {
      score: "3:2",
      duration: "45m 30s",
      startTime: "2024-01-15T14:00:00.000Z",
      endTime: "2024-01-15T14:45:30.000Z",
    };

    render(<SeriesStats teamData={teamData} playerData={playerData} title="Series Overview" metadata={metadata} />);

    const expectedStartTime = new Date(metadata.startTime).toLocaleString();
    const expectedEndTime = new Date(metadata.endTime).toLocaleString();

    expect(screen.getByText(expectedStartTime)).toBeInTheDocument();
    expect(screen.getByText(expectedEndTime)).toBeInTheDocument();
  });

  it("applies team colors to table rows when provided", () => {
    const teamData = [aFakeMatchStatsDataWith({ teamId: 0 }), aFakeMatchStatsDataWith({ teamId: 1 })];
    const playerData = [
      aFakeMatchStatsDataWith({
        teamId: 0,
        players: [aFakeMatchStatsPlayerDataWith({ name: "Player1" })],
      }),
    ];

    const { container } = render(
      <SeriesStats
        teamData={teamData}
        playerData={playerData}
        title="Series Overview"
        metadata={seriesMetadata}
        teamColors={teamColors}
      />,
    );

    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("handles empty team and player data gracefully", () => {
    render(<SeriesStats teamData={[]} playerData={[]} title="Empty Series" metadata={null} />);

    expect(screen.getByText("Empty Series")).toBeInTheDocument();
    const teamStatsElements = screen.queryAllByText("Accumulated Team Stats");
    expect(teamStatsElements).toHaveLength(0);
    const playerStatsElements = screen.queryAllByText("Accumulated Player Stats");
    expect(playerStatsElements).toHaveLength(0);
  });
});
