import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { aFakeMatchStatsWith } from "../../../stats/fakes/data";
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
    const stats = aFakeMatchStatsWith();
    const playerMap = new Map([
      ["1111111111", "Alpha"],
      ["2222222222", "Bravo"],
      ["3333333333", "Charlie"],
      ["4444444444", "Delta"],
    ]);

    render(<StatsPanel state={{ status: "loaded", stats, playerMap, medalMetadata: {}, analytics: null }} />);

    expect(screen.getByRole("tab", { name: "Players" })).toBeInTheDocument();
  });
});
