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
    expect(screen.getByText("Kills")).toBeInTheDocument();
    expect(screen.getByText("Deaths")).toBeInTheDocument();
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
    expect(screen.getByText("Kills")).toBeInTheDocument();
    expect(screen.getByText("Deaths")).toBeInTheDocument();

    const getToggleButton = (): HTMLElement => {
      const table = screen.getByRole("table", { name: "Kill matrix" });
      const toggleButton = table.querySelector("thead th button");
      expect(toggleButton).toBeInTheDocument();

      return toggleButton as HTMLElement;
    };

    await user.click(getToggleButton());

    expect(screen.getByTestId("team-icon-0")).toBeInTheDocument();
    expect(screen.getByTestId("team-icon-1")).toBeInTheDocument();
    expect(screen.getByText("Kills")).toBeInTheDocument();
    expect(screen.getByText("Deaths")).toBeInTheDocument();

    await user.click(getToggleButton());

    expect(screen.getByTestId("team-icon-0")).toBeInTheDocument();
    expect(screen.getByTestId("team-icon-1")).toBeInTheDocument();
    expect(screen.getByText("Kills")).toBeInTheDocument();
    expect(screen.getByText("Deaths")).toBeInTheDocument();
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

  it("keeps the same matrix when toggle button is clicked without transposedPivotData", async () => {
    const user = userEvent.setup();
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

    const table = screen.getByRole("table", { name: "Kill matrix" });
    const headerLabelBefore = table.querySelector("thead th:nth-child(2)")?.textContent.trim();
    const rowLabelBefore = table.querySelector("tbody tr td:first-child")?.textContent.trim();
    const toggleButton = table.querySelector("thead th button");

    expect(toggleButton).toBeInTheDocument();

    await user.click(toggleButton as HTMLElement);

    const nextTable = screen.getByRole("table", { name: "Kill matrix" });
    const headerLabelAfter = nextTable.querySelector("thead th:nth-child(2)")?.textContent.trim();
    const rowLabelAfter = nextTable.querySelector("tbody tr td:first-child")?.textContent.trim();

    expect(headerLabelAfter).toBe(headerLabelBefore);
    expect(rowLabelAfter).toBe(rowLabelBefore);
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

    const getHeaderAndRowLabels = (): { readonly headerLabel: string; readonly rowLabel: string } => {
      const table = screen.getByRole("table", { name: "Kill matrix" });
      const headerLabel = table.querySelector("thead th:nth-child(2)")?.textContent.trim();
      const rowLabel = table.querySelector("tbody tr td:first-child")?.textContent.trim();

      expect(headerLabel).toBeDefined();
      expect(rowLabel).toBeDefined();

      return { headerLabel: headerLabel ?? "", rowLabel: rowLabel ?? "" };
    };

    expect(screen.getByText("Kills")).toBeInTheDocument();
    expect(screen.getByText("Deaths")).toBeInTheDocument();
    expect(getHeaderAndRowLabels()).toEqual({ headerLabel: "Team 1Bravo", rowLabel: "Team 0Alpha" });

    const getToggleButton = (): HTMLElement => {
      const table = screen.getByRole("table", { name: "Kill matrix" });
      const toggleButton = table.querySelector("thead th button");
      expect(toggleButton).toBeInTheDocument();

      return toggleButton as HTMLElement;
    };

    await user.click(getToggleButton());

    expect(screen.getByText("Kills")).toBeInTheDocument();
    expect(screen.getByText("Deaths")).toBeInTheDocument();
    expect(getHeaderAndRowLabels()).toEqual({ headerLabel: "Team 0Alpha", rowLabel: "Team 1Bravo" });

    await user.click(getToggleButton());

    expect(getHeaderAndRowLabels()).toEqual({ headerLabel: "Team 1Bravo", rowLabel: "Team 0Alpha" });
  });
});
