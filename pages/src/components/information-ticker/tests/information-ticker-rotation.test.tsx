import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { TeamColor } from "../../team-colors/team-colors";
import type { TickerMatchGroup } from "../information-ticker";
import { InformationTicker } from "../information-ticker";

vi.mock("../../icons/team-icon", () => ({
  TeamIcon: ({ teamId }: { teamId: number }): React.ReactNode => (
    <div data-testid={`team-icon-${teamId.toString()}`} />
  ),
}));

// Uses the real ScrollingContent (unlike information-ticker.test.tsx which mocks it) so the
// cycle re-arming behaviour is exercised end to end via the non-overflow 10s timeout path.

const teamColors: TeamColor[] = [
  { id: "eagle", name: "Eagle", hex: "#0066CC" },
  { id: "cobra", name: "Cobra", hex: "#CC0000" },
];

function aSingleRowGroup(): TickerMatchGroup {
  return {
    matchIndex: 0,
    label: "Lattice",
    rows: [
      {
        type: "player",
        teamId: 0,
        name: "TrackedPlayer",
        stats: [{ name: "Kills", value: 14, bestInTeam: false, bestInMatch: false, display: "14" }],
        medals: [],
      },
    ],
  };
}

describe("InformationTicker rotation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    global.requestAnimationFrame = vi.fn(() => 0);
    global.cancelAnimationFrame = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps completing cycles for a single-row group when the parent advance is a no-op", () => {
    const onScrollComplete = vi.fn();

    render(
      <InformationTicker
        currentMatchGroup={aSingleRowGroup()}
        teamColors={teamColors}
        onScrollComplete={onScrollComplete}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onScrollComplete).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onScrollComplete).toHaveBeenCalledTimes(2);

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onScrollComplete).toHaveBeenCalledTimes(3);
  });

  it("keeps completing cycles when the parent re-renders with content-equal props", () => {
    const onScrollComplete = vi.fn();

    const { rerender } = render(
      <InformationTicker
        currentMatchGroup={aSingleRowGroup()}
        teamColors={teamColors}
        onScrollComplete={onScrollComplete}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onScrollComplete).toHaveBeenCalledTimes(1);

    // Simulate a data refresh delivering a new-but-equal group (memo blocks the re-render)
    rerender(
      <InformationTicker
        currentMatchGroup={aSingleRowGroup()}
        teamColors={teamColors}
        onScrollComplete={onScrollComplete}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onScrollComplete).toHaveBeenCalledTimes(2);
  });
});
