import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TrackerMatchHistoryEntry } from "../../../services/individual-tracker/types";
import { MatchCard } from "../match-card";

afterEach(() => {
  cleanup();
});

function aMatchEntry(overrides?: Partial<TrackerMatchHistoryEntry>): TrackerMatchHistoryEntry {
  return {
    matchId: "match-1",
    startTime: "Jan 1, 2026, 12:00:00 AM",
    endTime: "Jan 1, 2026, 12:10:00 AM",
    mapAssetId: "map-1",
    mapVersionId: "map-version-1",
    modeAssetId: "mode-1",
    modeVersionId: "mode-version-1",
    gameVariantCategory: 6,
    duration: "10m 0s",
    mapName: "Aquarius",
    modeName: "Slayer",
    outcome: "Win",
    resultString: "Win - 50:40",
    isMatchmaking: false,
    category: "custom",
    teams: [],
    mapThumbnailUrl: "data:,",
    ...overrides,
  };
}

describe("MatchCard", () => {
  it("renders the match title with mode and map name", () => {
    render(<MatchCard entry={aMatchEntry()} />);

    expect(screen.getByText("Slayer: Aquarius")).toBeInTheDocument();
  });

  it("renders the outcome", () => {
    render(<MatchCard entry={aMatchEntry({ outcome: "Win" })} />);

    expect(screen.getByText("Win")).toBeInTheDocument();
  });

  it("renders the category badge", () => {
    render(<MatchCard entry={aMatchEntry({ category: "matchmaking" })} />);

    expect(screen.getByText("Matchmaking")).toBeInTheDocument();
  });

  it("renders the playlist subtitle for matchmaking entries", () => {
    render(<MatchCard entry={aMatchEntry({ category: "matchmaking", matchmakingPlaylist: "Ranked Arena" })} />);

    expect(screen.getByText("Ranked Arena")).toBeInTheDocument();
  });

  it("does not render playlist subtitle for non-matchmaking entries", () => {
    render(<MatchCard entry={aMatchEntry({ category: "custom", matchmakingPlaylist: "Ranked Arena" })} />);

    expect(screen.queryByText("Ranked Arena")).not.toBeInTheDocument();
  });

  it("shows the checkbox when allowSelection is true", () => {
    render(<MatchCard entry={aMatchEntry()} allowSelection={true} />);

    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("hides the checkbox when allowSelection is false", () => {
    render(<MatchCard entry={aMatchEntry()} allowSelection={false} />);

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("calls onToggle when the checkbox is changed", () => {
    const onToggle = vi.fn<() => void>();
    render(<MatchCard entry={aMatchEntry()} allowSelection={true} onToggle={onToggle} />);

    fireEvent.click(screen.getByRole("checkbox"));

    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows add-to-above button when canAddToAbove is true", () => {
    render(<MatchCard entry={aMatchEntry()} canAddToAbove={true} />);

    expect(screen.getByTitle("Add to group above")).toBeInTheDocument();
  });

  it("shows add-to-below button when canAddToBelow is true", () => {
    render(<MatchCard entry={aMatchEntry()} canAddToBelow={true} />);

    expect(screen.getByTitle("Add to group below")).toBeInTheDocument();
  });

  it("shows break-from-group button when canBreakFromGroup is true", () => {
    render(<MatchCard entry={aMatchEntry()} canBreakFromGroup={true} />);

    expect(screen.getByTitle("Break from group")).toBeInTheDocument();
  });

  it("calls onAddToAbove when the add-to-above button is clicked", () => {
    const onAddToAbove = vi.fn<() => void>();
    render(<MatchCard entry={aMatchEntry()} canAddToAbove={true} onAddToAbove={onAddToAbove} />);

    fireEvent.click(screen.getByTitle("Add to group above"));

    expect(onAddToAbove).toHaveBeenCalledOnce();
  });

  it("calls onBreakFromGroup when the break button is clicked", () => {
    const onBreakFromGroup = vi.fn<() => void>();
    render(<MatchCard entry={aMatchEntry()} canBreakFromGroup={true} onBreakFromGroup={onBreakFromGroup} />);

    fireEvent.click(screen.getByTitle("Break from group"));

    expect(onBreakFromGroup).toHaveBeenCalledOnce();
  });
});
