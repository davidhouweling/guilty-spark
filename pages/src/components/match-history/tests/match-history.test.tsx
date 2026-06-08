import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { TrackerMatchHistoryEntry } from "../../../services/individual-tracker/types";
import { MatchHistory } from "../match-history";
import { MatchHistorySection } from "../create";
import { HALO_TEAM_COLORS } from "../../team-colors/team-colors";
import type { MatchHistoryModel } from "../match-history-presenter";

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

describe("MatchHistorySection", () => {
  it("calls add-to-above for a custom single match with a custom match above", () => {
    const onAddToAboveGroup = vi.fn<(matchId: string) => void>();

    render(
      <MatchHistorySection
        entries={[aMatchWith("m1", "custom", "Slayer"), aMatchWith("m2", "custom", "Oddball")]}
        allowManualGrouping={true}
        onAddToAboveGroup={onAddToAboveGroup}
      />,
    );

    fireEvent.click(screen.getByTitle("Add to group above"));

    expect(onAddToAboveGroup).toHaveBeenCalledWith("m2");
  });

  it("hides add controls for a matchmaking match", () => {
    render(<MatchHistorySection entries={[aMatchWith("m1", "matchmaking", "Slayer")]} allowManualGrouping={true} />);

    expect(screen.queryByTitle("Add to group above")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Add to group below")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Break from group")).not.toBeInTheDocument();
  });

  it("renders only break controls for grouped matches without eligible adjacent groupable matches", () => {
    render(
      <MatchHistorySection
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

  it("renders Load more button when hasMore is true", () => {
    render(
      <MatchHistorySection
        entries={[aMatchWith("m1", "custom", "Slayer")]}
        hasMore={true}
        onLoadMore={vi.fn<() => Promise<void>>().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("does not render Load more button when hasMore is false", () => {
    render(<MatchHistorySection entries={[aMatchWith("m1", "custom", "Slayer")]} hasMore={false} />);

    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("disables Load more button and shows Loading text when isLoadingMore is true", () => {
    const model: MatchHistoryModel = { segmentBlocks: [], isLoadingMore: true };

    render(
      <MatchHistory
        entries={[aMatchWith("m1", "custom", "Slayer")]}
        hasMore={true}
        onLoadMore={vi.fn<() => Promise<void>>().mockResolvedValue(undefined)}
        model={model}
      />,
    );

    const button = screen.getByRole("button", { name: "Loading…" });
    expect(button).toBeDisabled();
  });

  it("calls onLoadMore when Load more button is clicked", () => {
    const onLoadMore = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

    render(
      <MatchHistorySection entries={[aMatchWith("m1", "custom", "Slayer")]} hasMore={true} onLoadMore={onLoadMore} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));

    expect(onLoadMore).toHaveBeenCalledOnce();
  });

  it("rotates series colors by visible series order", () => {
    const { container } = render(
      <MatchHistorySection
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
