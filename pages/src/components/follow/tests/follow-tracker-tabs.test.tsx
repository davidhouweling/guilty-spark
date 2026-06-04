import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { FollowTrackerTabs } from "../follow-tracker-tabs";

function aDirectory(): TrackerDirectory {
  return {
    trackers: [
      {
        trackerId: "tracker-1",
        gamertag: "Spartan One",
        status: "active",
        isLive: true,
        accumulated: { total: 5, wins: 3, losses: 2, ties: 0 },
      },
      {
        trackerId: "tracker-2",
        gamertag: "Spartan Two",
        status: "active",
        isLive: false,
        accumulated: { total: 4, wins: 1, losses: 3, ties: 0 },
      },
    ],
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

  it("shows the record for each tracker", () => {
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
        {
          trackerId: "tracker-1",
          gamertag: "Spartan One",
          status: "active",
          isLive: false,
          accumulated: { total: 0, wins: 0, losses: 0, ties: 0 },
        },
      ],
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
        {
          trackerId: "tracker-1",
          gamertag: "Spartan One",
          status: "active",
          isLive: false,
          accumulated: { total: 0, wins: 0, losses: 0, ties: 0 },
        },
      ],
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
