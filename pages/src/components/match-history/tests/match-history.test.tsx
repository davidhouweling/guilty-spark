import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TrackerMatchHistoryEntry } from "../../../services/individual-tracker/types";
import { MatchHistory } from "../match-history";
import { HALO_TEAM_COLORS } from "../../team-colors/team-colors";

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
    mapAssetId: `map-${matchId}`,
    mapVersionId: `map-version-${matchId}`,
    modeAssetId: `mode-${matchId}`,
    modeVersionId: `mode-version-${matchId}`,
    gameVariantCategory: 6,
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

  it("rotates series colors by visible series order", () => {
    const { container } = render(
      <MatchHistory
        entries={[
          aMatchWith("m1", "custom", "Slayer"),
          aMatchWith("m2", "custom", "Oddball"),
          aMatchWith("m3", "custom", "Strongholds"),
          aMatchWith("m4", "custom", "Capture the Flag"),
        ]}
        showGroupings={true}
        groupings={[
          ["m1", "m2"],
          ["m3", "m4"],
        ]}
      />,
    );

    const seriesBlocks = Array.from(container.querySelectorAll("section"));

    expect(seriesBlocks[0]).toHaveAttribute("style", expect.stringContaining(HALO_TEAM_COLORS[0].hex));
    expect(seriesBlocks[1]).toHaveAttribute("style", expect.stringContaining(HALO_TEAM_COLORS[1].hex));
  });
});
