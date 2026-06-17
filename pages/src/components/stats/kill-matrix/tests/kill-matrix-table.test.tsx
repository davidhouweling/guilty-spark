import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { KillMatrixFormatter } from "../../../../controllers/stats/kill-matrix/kill-matrix-formatter";
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

  it("shows shimmer skeleton when loading", () => {
    render(
      <KillMatrixTable
        pivotData={{ tableRows: [], victimGamertags: [] }}
        ariaLabel="Kill matrix"
        emptyMessage="No kill matrix data."
        loading={true}
      />,
    );

    expect(screen.getByLabelText("Kill matrix")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("No kill matrix data.")).not.toBeInTheDocument();
  });

  it("shows empty message when not loading and no data", () => {
    render(
      <KillMatrixTable
        pivotData={{ tableRows: [], victimGamertags: [] }}
        ariaLabel="Kill matrix"
        emptyMessage="No kill matrix data."
        loading={false}
      />,
    );

    expect(screen.getByText("No kill matrix data.")).toBeInTheDocument();
  });
});
