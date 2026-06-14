import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { KillMatrixTable } from "../kill-matrix-table";

describe("KillMatrixTable", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders empty message when there are no rows", () => {
    render(<KillMatrixTable rows={[]} ariaLabel="Kill matrix" emptyMessage="No kill matrix data." />);

    expect(screen.getByText("No kill matrix data.")).toBeInTheDocument();
  });

  it("renders rows when data exists", () => {
    render(
      <KillMatrixTable
        ariaLabel="Kill matrix"
        emptyMessage="No kill matrix data."
        rows={[
          {
            key: "111:222",
            killer: { xuid: "111", gamertag: "Alpha", teamId: 0 },
            victim: { xuid: "222", gamertag: "Bravo", teamId: 1 },
            count: 3,
            headshotKills: 1,
            perfects: 0,
            classification: "enemy-kill",
          },
        ]}
      />,
    );

    expect(screen.getByLabelText("Kill matrix")).toBeInTheDocument();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
  });
});
