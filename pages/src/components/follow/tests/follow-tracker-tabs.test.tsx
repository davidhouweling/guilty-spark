import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TrackerDirectory, TrackerDirectoryEntry } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { FollowTrackerTabs } from "../follow-tracker-tabs";

type TrackerMatchOutcome = TrackerDirectoryEntry["matches"][number]["outcome"];

function aMatch(outcome: TrackerMatchOutcome): TrackerDirectoryEntry["matches"][number] {
  return {
    matchId: crypto.randomUUID(),
    startTime: "2026-01-01T00:00:00.000Z",
    endTime: "2026-01-01T00:10:00.000Z",
    mapAssetId: "map-1",
    mapVersionId: "map-version-1",
    mapName: "Aquarius",
    modeAssetId: "mode-1",
    gameVariantCategory: 6,
    outcome,
    score: "50:42",
    isMatchmaking: false,
  };
}

function aTracker(overrides: Partial<TrackerDirectoryEntry> = {}): TrackerDirectoryEntry {
  return {
    trackerId: "tracker-1",
    gamertag: "Spartan One",
    status: "active",
    isLive: false,
    matches: [],
    series: [],
    lastUpdateTime: "2026-01-01T00:00:00.000Z",
    lastMatchDiscoveredAt: null,
    hasActiveSeries: false,
    hasRecentCompletedSeries: false,
    ...overrides,
  };
}

function aDirectory(): TrackerDirectory {
  return {
    trackers: [
      aTracker({
        trackerId: "tracker-1",
        gamertag: "Spartan One",
        isLive: true,
        matches: [aMatch("Win"), aMatch("Win"), aMatch("Win"), aMatch("Loss"), aMatch("Loss")],
      }),
      aTracker({
        trackerId: "tracker-2",
        gamertag: "Spartan Two",
        matches: [aMatch("Win"), aMatch("Loss"), aMatch("Loss"), aMatch("Loss")],
      }),
    ],
    liveTrackerId: "tracker-1",
  };
}

describe("FollowTrackerTabs", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders one button per tracker", () => {
    render(
      <FollowTrackerTabs
        directory={aDirectory()}
        selectedTrackerId="tracker-1"
        isFollowingLive={true}
        onSelectTracker={vi.fn<(trackerId: string) => void>()}
        onFollowLive={vi.fn<() => void>()}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveTextContent("Spartan One");
    expect(tabs[1]).toHaveTextContent("Spartan Two");
  });

  it("shows the win-loss record for each tracker", () => {
    render(
      <FollowTrackerTabs
        directory={aDirectory()}
        selectedTrackerId="tracker-1"
        isFollowingLive={true}
        onSelectTracker={vi.fn<(trackerId: string) => void>()}
        onFollowLive={vi.fn<() => void>()}
      />,
    );

    const records = screen.getAllByTestId("tab-record");
    expect(records[0]).toHaveTextContent("3:2");
    expect(records[1]).toHaveTextContent("1:3");
  });

  it("shows Live badge on the live tracker", () => {
    render(
      <FollowTrackerTabs
        directory={aDirectory()}
        selectedTrackerId="tracker-1"
        isFollowingLive={true}
        onSelectTracker={vi.fn<(trackerId: string) => void>()}
        onFollowLive={vi.fn<() => void>()}
      />,
    );

    const badges = screen.getAllByTestId("live-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent("Live");
  });

  it("does not show a Live badge when no tracker is live", () => {
    const dir: TrackerDirectory = {
      trackers: [
        aTracker({
          trackerId: "tracker-1",
          gamertag: "Spartan One",
          status: "active",
          isLive: false,
        }),
      ],
      liveTrackerId: null,
    };

    render(
      <FollowTrackerTabs
        directory={dir}
        selectedTrackerId="tracker-1"
        isFollowingLive={true}
        onSelectTracker={vi.fn<(trackerId: string) => void>()}
        onFollowLive={vi.fn<() => void>()}
      />,
    );

    expect(screen.queryByTestId("live-badge")).toBeNull();
  });

  it("calls onSelectTracker with the correct trackerId when a tab is clicked", async () => {
    const onSelectTracker = vi.fn<(trackerId: string) => void>();

    render(
      <FollowTrackerTabs
        directory={aDirectory()}
        selectedTrackerId="tracker-1"
        isFollowingLive={true}
        onSelectTracker={onSelectTracker}
        onFollowLive={vi.fn<() => void>()}
      />,
    );

    const tabs = screen.getAllByRole("tab");
    await userEvent.click(tabs[1]);

    expect(onSelectTracker).toHaveBeenCalledOnce();
    expect(onSelectTracker).toHaveBeenCalledWith("tracker-2");
  });

  it("shows Follow live button when isFollowingLive is false and there is a live tracker", () => {
    render(
      <FollowTrackerTabs
        directory={aDirectory()}
        selectedTrackerId="tracker-2"
        isFollowingLive={false}
        onSelectTracker={vi.fn<(trackerId: string) => void>()}
        onFollowLive={vi.fn<() => void>()}
      />,
    );

    expect(screen.getByTestId("follow-live-btn")).toBeInTheDocument();
  });

  it("does not show Follow live button when isFollowingLive is true", () => {
    render(
      <FollowTrackerTabs
        directory={aDirectory()}
        selectedTrackerId="tracker-1"
        isFollowingLive={true}
        onSelectTracker={vi.fn<(trackerId: string) => void>()}
        onFollowLive={vi.fn<() => void>()}
      />,
    );

    expect(screen.queryByTestId("follow-live-btn")).toBeNull();
  });

  it("does not show Follow live button when no tracker is live", () => {
    const dir: TrackerDirectory = {
      trackers: [
        aTracker({
          trackerId: "tracker-1",
          gamertag: "Spartan One",
          status: "active",
          isLive: false,
        }),
      ],
      liveTrackerId: null,
    };

    render(
      <FollowTrackerTabs
        directory={dir}
        selectedTrackerId="tracker-1"
        isFollowingLive={false}
        onSelectTracker={vi.fn<(trackerId: string) => void>()}
        onFollowLive={vi.fn<() => void>()}
      />,
    );

    expect(screen.queryByTestId("follow-live-btn")).toBeNull();
  });

  it("calls onFollowLive when the Follow live button is clicked", async () => {
    const onFollowLive = vi.fn<() => void>();

    render(
      <FollowTrackerTabs
        directory={aDirectory()}
        selectedTrackerId="tracker-2"
        isFollowingLive={false}
        onSelectTracker={vi.fn<(trackerId: string) => void>()}
        onFollowLive={onFollowLive}
      />,
    );

    await userEvent.click(screen.getByTestId("follow-live-btn"));

    expect(onFollowLive).toHaveBeenCalledOnce();
  });
});
