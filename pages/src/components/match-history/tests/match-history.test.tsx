import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TrackerMatchHistoryEntry } from "../../../services/individual-tracker/types";
import { MatchHistory } from "../match-history";

afterEach(() => {
  cleanup();
});

function aMatchWith(
  matchId: string,
  category: TrackerMatchHistoryEntry["category"],
  modeName: string,
): TrackerMatchHistoryEntry {
  return {
    matchId,
    startTime: "Jan 1, 2026, 12:00:00 AM",
    endTime: "Jan 1, 2026, 12:10:00 AM",
    duration: "10m 0s",
    mapName: "Aquarius",
    modeName,
    outcome: "Win",
    resultString: "Win - 50:40",
    isMatchmaking: category === "matchmaking",
    category,
    teams: [],
    mapThumbnailUrl: "data:,",
  };
}

describe("MatchHistory", () => {
  it("calls add-to-above for a custom single match with a custom match above", () => {
    const onAddToAboveGroup = vi.fn<(matchId: string) => void>();

    render(
      <MatchHistory
        entries={[aMatchWith("m1", "custom", "Slayer"), aMatchWith("m2", "custom", "Oddball")]}
        allowManualGrouping={true}
        onAddToAboveGroup={onAddToAboveGroup}
      />,
    );

    fireEvent.click(screen.getByTitle("Add to group above"));

    expect(onAddToAboveGroup).toHaveBeenCalledWith("m2");
  });

  it("hides add controls for a matchmaking match", () => {
    render(<MatchHistory entries={[aMatchWith("m1", "matchmaking", "Slayer")]} allowManualGrouping={true} />);

    expect(screen.queryByTitle("Add to group above")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Add to group below")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Break from group")).not.toBeInTheDocument();
  });

  it("renders only break controls for grouped matches without eligible adjacent groupable matches", () => {
    render(
      <MatchHistory
        entries={[
          aMatchWith("m1", "custom", "Slayer"),
          aMatchWith("m2", "custom", "Oddball"),
          aMatchWith("m3", "custom", "Strongholds"),
        ]}
        showGroupings={true}
        allowManualGrouping={true}
        groupings={[["m1", "m2", "m3"]]}
      />,
    );

    expect(screen.queryByTitle("Add to group above")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Add to group below")).not.toBeInTheDocument();
    expect(screen.getAllByTitle("Break from group")).toHaveLength(3);
  });
});
