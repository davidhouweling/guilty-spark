import "@testing-library/jest-dom/vitest";

import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { TickerMatchGroup, TickerStatRow } from "../information-ticker";
import { InformationTicker } from "../information-ticker";
import type { TeamColor } from "../../team-colors/team-colors";

afterEach(() => {
  cleanup();
});

vi.mock("../../icons/team-icon", () => ({
  TeamIcon: ({ teamId, size }: { teamId: number; size: string }): React.ReactNode => (
    <div data-testid={`team-icon-${teamId.toString()}`} data-size={size}>
      Team {teamId.toString()}
    </div>
  ),
}));

vi.mock("../../icons/medal-icon", () => ({
  MedalIcon: ({ medalName, size }: { medalName: string; size: string }): React.ReactNode => (
    <div data-testid={`medal-icon-${medalName}`} data-size={size}>
      {medalName}
    </div>
  ),
}));

vi.mock("../../player-name/player-name", () => ({
  PlayerName: ({ discordName, gamertag }: { discordName: string | null; gamertag: string | null }): React.ReactNode => (
    <span data-testid="player-name">
      {discordName ?? ""} ({gamertag ?? ""})
    </span>
  ),
}));

vi.mock("../../scrolling-content/scrolling-content", () => ({
  ScrollingContent: ({
    children,
    onScrollComplete,
  }: {
    children: React.ReactNode;
    onScrollComplete?: () => void;
  }): React.ReactNode => {
    return (
      <div data-testid="scrolling-content" onClick={() => onScrollComplete?.()}>
        {children}
      </div>
    );
  },
}));

function aFakeTickerStatRowWith(overrides?: Partial<TickerStatRow>): TickerStatRow {
  return {
    type: "player",
    teamId: 0,
    name: "Player 1",
    discordName: "discord_player1",
    gamertag: "GamerTag1",
    stats: [
      {
        name: "Kills",
        value: 10,
        display: "10",
        icon: null,
        bestInTeam: false,
        bestInMatch: false,
      },
    ],
    medals: [{ name: "Killing Spree", count: 2 }],
    ...overrides,
  };
}

function aFakeTickerMatchGroupWith(overrides?: Partial<TickerMatchGroup>): TickerMatchGroup {
  return {
    matchIndex: 0,
    label: "Match 1",
    rows: [aFakeTickerStatRowWith()],
    ...overrides,
  };
}

describe("InformationTicker", () => {
  const teamColors: TeamColor[] = [
    { id: "eagle", name: "Eagle", hex: "#0066CC" },
    { id: "cobra", name: "Cobra", hex: "#CC0000" },
  ];

  it("renders ticker with label and first row", () => {
    const matchGroup = aFakeTickerMatchGroupWith({
      label: "Series Overview",
      rows: [
        aFakeTickerStatRowWith({ type: "team", name: "Team Eagle", teamId: 0, discordName: null, gamertag: null }),
      ],
    });

    const { container } = render(
      <InformationTicker currentMatchGroup={matchGroup} teamColors={teamColors} onScrollComplete={vi.fn()} />,
    );

    expect(screen.getByText("Series Overview")).toBeInTheDocument();
    expect(container.textContent).toContain("Eagle");
  });

  it("displays team row with stats", () => {
    const matchGroup = aFakeTickerMatchGroupWith({
      rows: [
        aFakeTickerStatRowWith({
          type: "team",
          teamId: 0,
          name: "Team Eagle",
          stats: [
            {
              name: "Score",
              value: 50,
              display: "50",
              icon: null,
              bestInTeam: false,
              bestInMatch: true,
            },
          ],
        }),
      ],
    });

    render(<InformationTicker currentMatchGroup={matchGroup} teamColors={teamColors} onScrollComplete={vi.fn()} />);

    expect(screen.getByText("Team Eagle")).toBeInTheDocument();
    expect(screen.getByText("Score:")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
  });

  it("displays player row with discord name and gamertag", () => {
    const matchGroup = aFakeTickerMatchGroupWith({
      rows: [
        aFakeTickerStatRowWith({
          type: "player",
          teamId: 0,
          name: "Player 1",
          discordName: "discord_player1",
          gamertag: "GamerTag1",
        }),
      ],
    });

    render(<InformationTicker currentMatchGroup={matchGroup} teamColors={teamColors} onScrollComplete={vi.fn()} />);

    expect(screen.getByTestId("player-name")).toBeInTheDocument();
  });

  it("displays player row without discord name or gamertag", () => {
    const matchGroup = aFakeTickerMatchGroupWith({
      rows: [
        aFakeTickerStatRowWith({
          type: "player",
          teamId: 0,
          name: "Unknown Player",
          discordName: null,
          gamertag: null,
        }),
      ],
    });

    render(<InformationTicker currentMatchGroup={matchGroup} teamColors={teamColors} onScrollComplete={vi.fn()} />);

    expect(screen.getByText("Unknown Player")).toBeInTheDocument();
  });

  it("displays multiple stats for a row", () => {
    const matchGroup = aFakeTickerMatchGroupWith({
      rows: [
        aFakeTickerStatRowWith({
          stats: [
            {
              name: "Kills",
              value: 15,
              display: "15",
              icon: null,
              bestInTeam: true,
              bestInMatch: false,
            },
            {
              name: "Deaths",
              value: 8,
              display: "8",
              icon: null,
              bestInTeam: false,
              bestInMatch: false,
            },
          ],
        }),
      ],
    });

    render(<InformationTicker currentMatchGroup={matchGroup} teamColors={teamColors} onScrollComplete={vi.fn()} />);

    expect(screen.getByText("Kills:")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("Deaths:")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("displays medals when present", () => {
    const matchGroup = aFakeTickerMatchGroupWith({
      rows: [
        aFakeTickerStatRowWith({
          medals: [
            { name: "Killing Spree", count: 2 },
            { name: "Double Kill", count: 5 },
          ],
        }),
      ],
    });

    render(<InformationTicker currentMatchGroup={matchGroup} teamColors={teamColors} onScrollComplete={vi.fn()} />);

    expect(screen.getByTestId("medal-icon-Killing Spree")).toBeInTheDocument();
    expect(screen.getByTestId("medal-icon-Double Kill")).toBeInTheDocument();
    expect(screen.getByText("2×")).toBeInTheDocument();
    expect(screen.getByText("5×")).toBeInTheDocument();
  });

  it("does not display medal count for single medals", () => {
    const matchGroup = aFakeTickerMatchGroupWith({
      rows: [
        aFakeTickerStatRowWith({
          medals: [{ name: "Killing Spree", count: 1 }],
        }),
      ],
    });

    const { container } = render(
      <InformationTicker currentMatchGroup={matchGroup} teamColors={teamColors} onScrollComplete={vi.fn()} />,
    );

    expect(screen.getByTestId("medal-icon-Killing Spree")).toBeInTheDocument();
    expect(container.textContent).not.toContain("1×");
  });

  it("calls onScrollComplete when scrolling completes", () => {
    const onScrollComplete = vi.fn();
    const matchGroup = aFakeTickerMatchGroupWith({
      rows: [aFakeTickerStatRowWith()],
    });

    render(
      <InformationTicker currentMatchGroup={matchGroup} teamColors={teamColors} onScrollComplete={onScrollComplete} />,
    );

    const scrollingContent = screen.getByTestId("scrolling-content");
    scrollingContent.click();

    expect(onScrollComplete).toHaveBeenCalledTimes(1);
  });

  it("renders scrolling content for stats and medals", () => {
    const matchGroup = aFakeTickerMatchGroupWith({
      rows: [
        aFakeTickerStatRowWith({ name: "Player 1", teamId: 0 }),
        aFakeTickerStatRowWith({ name: "Player 2", teamId: 1 }),
      ],
    });

    render(<InformationTicker currentMatchGroup={matchGroup} teamColors={teamColors} onScrollComplete={vi.fn()} />);

    expect(screen.getByTestId("scrolling-content")).toBeInTheDocument();
  });

  it("renders with new match group when it changes", () => {
    const matchGroup1 = aFakeTickerMatchGroupWith({
      matchIndex: 0,
      label: "Match 1",
      rows: [aFakeTickerStatRowWith({ name: "Player 1" })],
    });

    const matchGroup2 = aFakeTickerMatchGroupWith({
      matchIndex: 1,
      label: "Match 2",
      rows: [aFakeTickerStatRowWith({ name: "Player 3" })],
    });

    const { rerender } = render(
      <InformationTicker currentMatchGroup={matchGroup1} teamColors={teamColors} onScrollComplete={vi.fn()} />,
    );

    expect(screen.getByText("Match 1")).toBeInTheDocument();

    rerender(<InformationTicker currentMatchGroup={matchGroup2} teamColors={teamColors} onScrollComplete={vi.fn()} />);

    expect(screen.getByText("Match 2")).toBeInTheDocument();
  });

  it("renders team icon with correct teamId", () => {
    const matchGroup = aFakeTickerMatchGroupWith({
      rows: [aFakeTickerStatRowWith({ teamId: 1 })],
    });

    render(<InformationTicker currentMatchGroup={matchGroup} teamColors={teamColors} onScrollComplete={vi.fn()} />);

    expect(screen.getByTestId("team-icon-1")).toBeInTheDocument();
  });

  it("applies team color to row styling", () => {
    const matchGroup = aFakeTickerMatchGroupWith({
      rows: [aFakeTickerStatRowWith({ teamId: 0 })],
    });

    const { container } = render(
      <InformationTicker currentMatchGroup={matchGroup} teamColors={teamColors} onScrollComplete={vi.fn()} />,
    );

    const rowElement = container.querySelector("[style*='--row-color']");
    expect(rowElement).toBeInTheDocument();
  });
});
