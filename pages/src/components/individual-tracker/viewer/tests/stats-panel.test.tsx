import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { aFakeMatchStatsWith } from "../../../../controllers/stats/fakes/data";
import { StatsController } from "../../../../controllers/stats/stats-controller";
import { KillMatrixFormatter } from "../../../../controllers/stats/kill-matrix/kill-matrix-formatter";
import type { MatchStatsPanelState } from "../types";
import { StatsPanel } from "../stats-panel";

vi.mock("../../../icons/team-icon", () => ({
  TeamIcon: ({ teamId }: { teamId: number }): React.ReactNode => (
    <div data-testid={`team-icon-${teamId.toString()}`}>Team {teamId.toString()}</div>
  ),
}));

vi.mock("../../../icons/medal-icon", () => ({
  MedalIcon: ({ medalName }: { medalName: string }): React.ReactNode => (
    <div data-testid={`medal-icon-${medalName}`}>{medalName}</div>
  ),
}));

function aLoadedState(
  overrides: Partial<Extract<MatchStatsPanelState, { status: "loaded" }>> = {},
): Extract<MatchStatsPanelState, { status: "loaded" }> {
  const stats = aFakeMatchStatsWith();
  const playerMap = new Map([
    ["1111111111", "Alpha"],
    ["2222222222", "Bravo"],
    ["3333333333", "Charlie"],
    ["4444444444", "Delta"],
  ]);
  const controller = new StatsController();
  controller.loadMatch(stats, playerMap, {});
  return {
    status: "loaded",
    matchId: stats.MatchId,
    gameVariantCategory: stats.MatchInfo.GameVariantCategory,
    duration: stats.MatchInfo.Duration,
    startTime: stats.MatchInfo.StartTime,
    endTime: stats.MatchInfo.EndTime,
    data: controller.getMatchStats(),
    killMatrixPivotData: { tableRows: [], victimGamertags: [] },
    ...overrides,
  };
}

describe("StatsPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when state is null", () => {
    const { container } = render(<StatsPanel state={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a loading indicator when status is loading", () => {
    render(<StatsPanel state={{ status: "loading" }} />);
    expect(screen.getByText("Establishing Connection...")).toBeInTheDocument();
  });

  it("renders an alert with the error message when status is error", () => {
    render(<StatsPanel state={{ status: "error", message: "Match not found" }} />);
    expect(screen.getByText("Match not found")).toBeInTheDocument();
  });

  it("renders match stats player table when status is loaded", () => {
    render(<StatsPanel state={aLoadedState()} />);

    expect(screen.getByRole("tab", { name: "Players" })).toBeInTheDocument();
  });

  it("renders kill matrix table when kill matrix rows are provided", () => {
    const stats = aFakeMatchStatsWith();
    const playerMap = new Map([
      ["1111111111", "Alpha"],
      ["2222222222", "Bravo"],
      ["3333333333", "Charlie"],
      ["4444444444", "Delta"],
    ]);
    const controller = new StatsController();
    controller.loadAnalytics(
      {
        requestedModules: ["killMatrix"],
        killMatrix: {
          "1111111111:2222222222": {
            count: 3,
            headshotKills: 1,
            perfects: 0,
            weapons: [],
          },
        },
        metadata: {
          pairingQuality: { unpairedDeathCount: 0, maxTimeDeltaMs: 1 },
          perfectCounts: { total: 0, byXuid: {} },
        },
      },
      playerMap,
    );
    controller.loadMatch(stats, playerMap, {});

    render(
      <StatsPanel
        state={aLoadedState({ killMatrixPivotData: KillMatrixFormatter.pivot(controller.getKillMatrix()) })}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Kill Matrix" }));

    expect(screen.getByLabelText("Match kill matrix")).toBeInTheDocument();
    expect(screen.queryByText("Kill matrix data is not available for this match yet.")).not.toBeInTheDocument();
  });
});
