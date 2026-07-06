import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import {
  aDirectoryWith,
  aMatchWith,
  aTrackerWith,
} from "@guilty-spark/shared/contracts/individual-tracker/fakes/follow.fake";
import { FollowTrackerTabs } from "../follow-tracker-tabs";

function aTabsDirectoryWithWinsAndLosses(): TrackerDirectory {
  return aDirectoryWith({
    trackers: [
      aTrackerWith({
        trackerId: "tracker-1",
        gamertag: "Spartan One",
        isLive: true,
        matches: [
          aMatchWith({ outcome: "Win" }),
          aMatchWith({ outcome: "Win" }),
          aMatchWith({ outcome: "Win" }),
          aMatchWith({ outcome: "Loss" }),
          aMatchWith({ outcome: "Loss" }),
        ],
      }),
      aTrackerWith({
        trackerId: "tracker-2",
        gamertag: "Spartan Two",
        matches: [
          aMatchWith({ outcome: "Win" }),
          aMatchWith({ outcome: "Loss" }),
          aMatchWith({ outcome: "Loss" }),
          aMatchWith({ outcome: "Loss" }),
        ],
      }),
    ],
    liveTrackerId: "tracker-1",
  });
}

describe("FollowTrackerTabs", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders one button per tracker", () => {
    render(
      <FollowTrackerTabs
        directory={aTabsDirectoryWithWinsAndLosses()}
        selectedTrackerId="tracker-1"
        onSelectTracker={vi.fn<(trackerId: string) => void>()}
      />,
    );

    const trackerButtons = screen.getAllByRole("button", { name: /Spartan/ });
    expect(trackerButtons).toHaveLength(2);
    expect(trackerButtons[0]).toHaveTextContent("Spartan One");
    expect(trackerButtons[1]).toHaveTextContent("Spartan Two");
  });

  it("shows Live badge on the live tracker", () => {
    render(
      <FollowTrackerTabs
        directory={aTabsDirectoryWithWinsAndLosses()}
        selectedTrackerId="tracker-1"
        onSelectTracker={vi.fn<(trackerId: string) => void>()}
      />,
    );

    const badges = screen.getAllByTestId("live-badge");
    expect(badges).toHaveLength(1);
    expect(badges[0]).toHaveTextContent("Live");
  });

  it("does not show a Live badge when no tracker is live", () => {
    const dir: TrackerDirectory = {
      trackers: [
        aTrackerWith({
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
        onSelectTracker={vi.fn<(trackerId: string) => void>()}
      />,
    );

    expect(screen.queryByTestId("live-badge")).toBeNull();
  });

  it("calls onSelectTracker with the correct trackerId when a tab is clicked", async () => {
    const onSelectTracker = vi.fn<(trackerId: string) => void>();

    render(
      <FollowTrackerTabs
        directory={aTabsDirectoryWithWinsAndLosses()}
        selectedTrackerId="tracker-1"
        onSelectTracker={onSelectTracker}
      />,
    );

    const trackerButtons = screen.getAllByRole("button", { name: /Spartan/ });
    await userEvent.click(trackerButtons[1]);

    expect(onSelectTracker).toHaveBeenCalledOnce();
    expect(onSelectTracker).toHaveBeenCalledWith("tracker-2");
  });

  it("renders no tabs when directory is empty", () => {
    const emptyDirectory: TrackerDirectory = {
      trackers: [],
      liveTrackerId: null,
    };

    render(
      <FollowTrackerTabs
        directory={emptyDirectory}
        selectedTrackerId={null}
        onSelectTracker={vi.fn<(trackerId: string) => void>()}
      />,
    );

    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("renders tracker navigation even when selectedTrackerId is null", async () => {
    const onSelectTracker = vi.fn<(trackerId: string) => void>();

    render(
      <FollowTrackerTabs
        directory={aTabsDirectoryWithWinsAndLosses()}
        selectedTrackerId={null}
        onSelectTracker={onSelectTracker}
      />,
    );

    const trackerButtons = screen.getAllByRole("button", { name: /Spartan/ });
    await userEvent.click(trackerButtons[0]);

    expect(onSelectTracker).toHaveBeenCalledWith("tracker-1");
  });
});
