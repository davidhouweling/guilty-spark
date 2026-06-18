import "@testing-library/jest-dom/vitest";

import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../icons/team-icon", () => ({
  TeamIcon: ({ teamId }: { teamId: number }): ReactNode => (
    <div data-testid={`team-icon-${teamId.toString()}`}>Team {teamId.toString()}</div>
  ),
}));
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ComponentLoaderStatus } from "../../../component-loader/component-loader";
import { KillMatrixFormatter } from "../../../../controllers/stats/kill-matrix/kill-matrix-formatter";
import { EMPTY_KILL_MATRIX_PIVOT_DATA } from "../../../../controllers/stats/kill-matrix/types";
import { KillMatrixTable } from "../kill-matrix-table";

describe("KillMatrixTable", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders empty message when there are no rows", () => {
    render(
      <KillMatrixTable
        pivotData={KillMatrixFormatter.pivot([])}
        ariaLabel="Kill matrix"
        emptyMessage="No kill matrix data."
      />,
    );

    expect(screen.getByText("No kill matrix data.")).toBeInTheDocument();
  });

  it("renders rows when data exists with axis labels", () => {
    const pivotData = KillMatrixFormatter.pivot([
      {
        key: "111:222",
        killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
        victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
        count: 3,
        headshotKills: 1,
        perfects: 0,
        classification: "enemy-kill",
      },
    ]);

    render(<KillMatrixTable pivotData={pivotData} ariaLabel="Kill matrix" emptyMessage="No kill matrix data." />);

    expect(screen.getByLabelText("Kill matrix")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.getByText("Killer")).toBeInTheDocument();
    expect(screen.getByText("Deaths →")).toBeInTheDocument();
  });

  it("shows shimmer skeleton when status is loading", () => {
    render(
      <KillMatrixTable
        pivotData={EMPTY_KILL_MATRIX_PIVOT_DATA}
        ariaLabel="Kill matrix"
        emptyMessage="No kill matrix data."
        status={ComponentLoaderStatus.LOADING}
      />,
    );

    const shimmer = screen.getByRole("region", { name: "Kill matrix" });
    expect(shimmer).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("No kill matrix data.")).not.toBeInTheDocument();
  });

  it("shows NxN shimmer table using default 8 players when playerHeaders is an empty array", () => {
    render(
      <KillMatrixTable
        pivotData={EMPTY_KILL_MATRIX_PIVOT_DATA}
        ariaLabel="Kill matrix"
        emptyMessage="No kill matrix data."
        status={ComponentLoaderStatus.LOADING}
        playerHeaders={[]}
      />,
    );

    const shimmer = screen.getByRole("region", { name: "Kill matrix" });
    expect(shimmer).toHaveAttribute("aria-busy", "true");
    // (N+1)^2 cells: 1 killer header + N victim headers + N rows × (1 label + N cells)
    expect(shimmer.querySelectorAll("th, td")).toHaveLength(81);
  });

  it("shows NxN shimmer table using playerHeaders when provided", () => {
    render(
      <KillMatrixTable
        pivotData={EMPTY_KILL_MATRIX_PIVOT_DATA}
        ariaLabel="Kill matrix"
        emptyMessage="No kill matrix data."
        status={ComponentLoaderStatus.LOADING}
        playerHeaders={[
          { gamertag: "Alpha", teamId: null },
          { gamertag: "Bravo", teamId: null },
          { gamertag: "Charlie", teamId: null },
        ]}
      />,
    );

    const shimmer = screen.getByRole("region", { name: "Kill matrix" });
    expect(shimmer).toHaveAttribute("aria-busy", "true");
    // 3 players: (3+1)^2 = 16 cells; each name appears in header row + row label
    expect(shimmer.querySelectorAll("th, td")).toHaveLength(16);
    expect(screen.getAllByText("Alpha")).toHaveLength(2);
    expect(screen.getAllByText("Bravo")).toHaveLength(2);
    expect(screen.getAllByText("Charlie")).toHaveLength(2);
  });

  it("shows emptyMessage when status is error and no errorMessage is provided", () => {
    render(
      <KillMatrixTable
        pivotData={EMPTY_KILL_MATRIX_PIVOT_DATA}
        ariaLabel="Kill matrix"
        emptyMessage="Kill matrix data is not available."
        status={ComponentLoaderStatus.ERROR}
      />,
    );

    expect(screen.getByText("Kill matrix data is not available.")).toBeInTheDocument();
  });

  it("shows errorMessage instead of emptyMessage when status is error and errorMessage is provided", () => {
    render(
      <KillMatrixTable
        pivotData={EMPTY_KILL_MATRIX_PIVOT_DATA}
        ariaLabel="Kill matrix"
        emptyMessage="Kill matrix data is not available."
        errorMessage="Failed to load kill matrix data."
        status={ComponentLoaderStatus.ERROR}
      />,
    );

    expect(screen.getByText("Failed to load kill matrix data.")).toBeInTheDocument();
    expect(screen.queryByText("Kill matrix data is not available.")).not.toBeInTheDocument();
  });

  it("shows empty message when status is loaded and no data", () => {
    render(
      <KillMatrixTable
        pivotData={EMPTY_KILL_MATRIX_PIVOT_DATA}
        ariaLabel="Kill matrix"
        emptyMessage="No kill matrix data."
        status={ComponentLoaderStatus.LOADED}
      />,
    );

    expect(screen.getByText("No kill matrix data.")).toBeInTheDocument();
  });

  it("renders team icons for killer row labels and victim column headers", () => {
    const pivotData = KillMatrixFormatter.pivot([
      {
        key: "111:222",
        killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
        victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
        count: 3,
        headshotKills: 1,
        perfects: 0,
        classification: "enemy-kill",
      },
    ]);

    render(<KillMatrixTable pivotData={pivotData} ariaLabel="Kill matrix" emptyMessage="No kill matrix data." />);

    expect(screen.getByTestId("team-icon-0")).toBeInTheDocument();
    expect(screen.getByTestId("team-icon-1")).toBeInTheDocument();
  });

  it("renders team icons after toggling to deaths view and back", async () => {
    const user = userEvent.setup();
    const rows = [
      {
        key: "111:222",
        killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
        victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
        count: 3,
        headshotKills: 1,
        perfects: 0,
        classification: "enemy-kill" as const,
      },
    ];
    const pivotData = KillMatrixFormatter.pivot(rows);
    const transposedPivotData = KillMatrixFormatter.transpose(rows);

    render(
      <KillMatrixTable
        pivotData={pivotData}
        ariaLabel="Kill matrix"
        emptyMessage="No kill matrix data."
        transposedPivotData={transposedPivotData}
      />,
    );

    expect(screen.getByTestId("team-icon-0")).toBeInTheDocument();
    expect(screen.getByTestId("team-icon-1")).toBeInTheDocument();

    await user.click(screen.getByText("Switch to Deaths view"));

    expect(screen.getByTestId("team-icon-0")).toBeInTheDocument();
    expect(screen.getByTestId("team-icon-1")).toBeInTheDocument();

    await user.click(screen.getByText("Switch to Kills view"));

    expect(screen.getByTestId("team-icon-0")).toBeInTheDocument();
    expect(screen.getByTestId("team-icon-1")).toBeInTheDocument();
  });

  it("applies team color background to killer cells and victim column headers when teamColors provided", () => {
    const teamColors = [
      { id: "salmon", name: "Salmon", hex: "#FE3939" },
      { id: "cerulean", name: "Cerulean", hex: "#3B9DFF" },
    ];
    const pivotData = KillMatrixFormatter.pivot([
      {
        key: "111:222",
        killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
        victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
        count: 3,
        headshotKills: 1,
        perfects: 0,
        classification: "enemy-kill",
      },
    ]);

    render(
      <KillMatrixTable
        pivotData={pivotData}
        ariaLabel="Kill matrix"
        emptyMessage="No kill matrix data."
        teamColors={teamColors}
      />,
    );

    const table = screen.getByRole("table", { name: "Kill matrix" });
    const headers = table.querySelectorAll("thead th");
    const victimHeader = Array.from(headers).find((th) => th.textContent.includes("Bravo"));
    expect(victimHeader).toHaveStyle({ "--col-team-color": "#3B9DFF" });

    const killerCell = table.querySelector("tbody tr td:first-child");
    expect(killerCell).toHaveStyle({ "--row-team-color": "#FE3939" });
  });

  it("does not render toggle button when transposedPivotData is not provided", () => {
    const pivotData = KillMatrixFormatter.pivot([
      {
        key: "111:222",
        killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
        victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
        count: 3,
        headshotKills: 1,
        perfects: 0,
        classification: "enemy-kill",
      },
    ]);

    render(<KillMatrixTable pivotData={pivotData} ariaLabel="Kill matrix" emptyMessage="No kill matrix data." />);

    expect(screen.queryByText("Switch to Deaths view")).not.toBeInTheDocument();
    expect(screen.queryByText("Switch to Kills view")).not.toBeInTheDocument();
  });

  it("toggles between kills and deaths view when toggle button is clicked", async () => {
    const user = userEvent.setup();
    const rows = [
      {
        key: "111:222",
        killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
        victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
        count: 3,
        headshotKills: 1,
        perfects: 0,
        classification: "enemy-kill" as const,
      },
    ];
    const pivotData = KillMatrixFormatter.pivot(rows);
    const transposedPivotData = KillMatrixFormatter.transpose(rows);

    render(
      <KillMatrixTable
        pivotData={pivotData}
        ariaLabel="Kill matrix"
        emptyMessage="No kill matrix data."
        transposedPivotData={transposedPivotData}
      />,
    );

    expect(screen.getByText("Deaths →")).toBeInTheDocument();
    expect(screen.getByText("Killer")).toBeInTheDocument();
    expect(screen.getByText("Switch to Deaths view")).toBeInTheDocument();

    await user.click(screen.getByText("Switch to Deaths view"));

    expect(screen.getByText("Kills →")).toBeInTheDocument();
    expect(screen.getByText("Victim")).toBeInTheDocument();
    expect(screen.getByText("Switch to Kills view")).toBeInTheDocument();

    await user.click(screen.getByText("Switch to Kills view"));

    expect(screen.getByText("Deaths →")).toBeInTheDocument();
  });
});
