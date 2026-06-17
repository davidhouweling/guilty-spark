import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

  it("shows 8 shimmer rows when playerGamertags is an empty array", () => {
    render(
      <KillMatrixTable
        pivotData={EMPTY_KILL_MATRIX_PIVOT_DATA}
        ariaLabel="Kill matrix"
        emptyMessage="No kill matrix data."
        status={ComponentLoaderStatus.LOADING}
        playerGamertags={[]}
      />,
    );

    const shimmer = screen.getByRole("region", { name: "Kill matrix" });
    expect(shimmer).toHaveAttribute("aria-busy", "true");
    expect(shimmer.children).toHaveLength(8);
  });

  it("shows shimmer rows using playerGamertags when provided", () => {
    render(
      <KillMatrixTable
        pivotData={EMPTY_KILL_MATRIX_PIVOT_DATA}
        ariaLabel="Kill matrix"
        emptyMessage="No kill matrix data."
        status={ComponentLoaderStatus.LOADING}
        playerGamertags={["Alpha", "Bravo", "Charlie"]}
      />,
    );

    const shimmer = screen.getByRole("region", { name: "Kill matrix" });
    expect(shimmer).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
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
});
