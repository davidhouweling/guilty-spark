import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TrackerListItem, TrackerRowAction } from "../tracker-list";
import { TrackerList } from "../tracker-list";

afterEach(() => {
  cleanup();
});

describe("TrackerList", () => {
  it("renders empty state when no items are present", () => {
    render(<TrackerList items={[]} getActions={() => []} />);

    expect(screen.getByText("No trackers yet. Start with your linked gamertag above.")).toBeInTheDocument();
    expect(screen.getByText("How individual tracking works")).toBeInTheDocument();
  });

  it("renders tracker row with gamertag, status badge, and live badge", () => {
    const item: TrackerListItem = {
      trackerId: "tracker-1",
      gamertag: "Chief",
      xuid: null,
      status: "active",
      isLive: true,
      isPinned: false,
      hasActiveSeries: false,
    };

    render(<TrackerList items={[item]} getActions={() => []} />);

    expect(screen.getByText("Chief")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("renders paused status badge for a paused tracker", () => {
    const item: TrackerListItem = {
      trackerId: "tracker-2",
      gamertag: "Arbiter",
      xuid: null,
      status: "paused",
      isLive: false,
      isPinned: false,
      hasActiveSeries: false,
    };

    render(<TrackerList items={[item]} getActions={() => []} />);

    expect(screen.getByText("Paused")).toBeInTheDocument();
    expect(screen.queryByText("Live")).not.toBeInTheDocument();
  });

  it("renders the pinned label when tracker is pinned", () => {
    const item: TrackerListItem = {
      trackerId: "tracker-3",
      gamertag: "Noble Six",
      xuid: null,
      status: "active",
      isLive: false,
      isPinned: true,
      hasActiveSeries: false,
    };

    render(<TrackerList items={[item]} getActions={() => []} />);

    expect(screen.getByText("(your account)")).toBeInTheDocument();
  });

  it("renders stopped status badge for a stopped tracker", () => {
    const item: TrackerListItem = {
      trackerId: "tracker-5",
      gamertag: "Spartan",
      xuid: null,
      status: "stopped",
      isLive: false,
      isPinned: false,
      hasActiveSeries: false,
    };

    render(<TrackerList items={[item]} getActions={() => []} />);

    expect(screen.getByText("Stopped")).toBeInTheDocument();
  });

  it("renders not-started status badge for a not-started tracker", () => {
    const item: TrackerListItem = {
      trackerId: "tracker-6",
      gamertag: "Rookie",
      xuid: null,
      status: "not-started",
      isLive: false,
      isPinned: false,
      hasActiveSeries: false,
    };

    render(<TrackerList items={[item]} getActions={() => []} />);

    expect(screen.getByText("Not started")).toBeInTheDocument();
  });

  it("does not render pinned label when tracker is not pinned", () => {
    const item: TrackerListItem = {
      trackerId: "tracker-4",
      gamertag: "Buck",
      xuid: null,
      status: "active",
      isLive: false,
      isPinned: false,
      hasActiveSeries: false,
    };

    render(<TrackerList items={[item]} getActions={() => []} />);

    expect(screen.queryByText("(your account)")).not.toBeInTheDocument();
  });

  it("renders a row per item", () => {
    const items: readonly TrackerListItem[] = [
      {
        trackerId: "t-1",
        gamertag: "Alpha",
        xuid: null,
        status: "active",
        isLive: true,
        isPinned: false,
        hasActiveSeries: false,
      },
      {
        trackerId: "t-2",
        gamertag: "Bravo",
        xuid: null,
        status: "paused",
        isLive: false,
        isPinned: false,
        hasActiveSeries: false,
      },
    ];

    render(<TrackerList items={items} getActions={() => []} />);

    const rows = screen.getAllByTestId("tracker-row");
    expect(rows).toHaveLength(2);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
  });

  it("calls getActions for each tracker item", () => {
    const item: TrackerListItem = {
      trackerId: "tracker-1",
      gamertag: "Chief",
      xuid: null,
      status: "active",
      isLive: false,
      isPinned: false,
      hasActiveSeries: false,
    };

    const getActions = vi.fn<(item: TrackerListItem) => readonly TrackerRowAction[]>(() => []);

    render(<TrackerList items={[item]} getActions={getActions} />);

    expect(getActions).toHaveBeenCalledWith(item);
    expect(getActions).toHaveBeenCalledOnce();
  });

  it("fires the action onClick when an action button is clicked", async () => {
    const user = userEvent.setup();
    const item: TrackerListItem = {
      trackerId: "tracker-1",
      gamertag: "Chief",
      xuid: null,
      status: "active",
      isLive: false,
      isPinned: false,
      hasActiveSeries: false,
    };

    const onClick = vi.fn<() => void>();
    const getActions = (): readonly TrackerRowAction[] => [{ label: "Pause", onClick }];

    render(<TrackerList items={[item]} getActions={getActions} />);

    await user.click(screen.getByRole("button", { name: `Options for ${item.gamertag}` }));
    await user.click(screen.getByRole("button", { name: "Pause" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders primary actions as visible buttons", async () => {
    const user = userEvent.setup();
    const item: TrackerListItem = {
      trackerId: "tracker-7",
      gamertag: "Chief",
      xuid: null,
      status: "active",
      isLive: false,
      isPinned: false,
      hasActiveSeries: false,
    };

    const onRefresh = vi.fn<() => void>();
    const onDelete = vi.fn<() => void>();

    render(
      <TrackerList
        items={[item]}
        getActions={() => [
          { label: "Refresh", primary: true, onClick: onRefresh },
          { label: "Delete tracker", onClick: onDelete },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Delete tracker" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: `Options for ${item.gamertag}` }));
    expect(screen.getAllByRole("button", { name: "Refresh" })).toHaveLength(1);
  });

  it("disables loading primary actions", () => {
    const item: TrackerListItem = {
      trackerId: "tracker-8",
      gamertag: "Arbiter",
      xuid: null,
      status: "active",
      isLive: false,
      isPinned: false,
      hasActiveSeries: false,
    };

    render(
      <TrackerList
        items={[item]}
        getActions={() => [{ label: "Refresh", primary: true, loading: true, onClick: vi.fn<() => void>() }]}
      />,
    );

    const refreshButton = screen.getByRole("button", { name: "Refresh" });
    expect(refreshButton).toBeDisabled();
    expect(refreshButton).toHaveAttribute("aria-busy", "true");
  });

  it("calls onAddTracker when the add tracker button is clicked", async () => {
    const user = userEvent.setup();
    const onAddTracker = vi.fn<() => void>();

    render(<TrackerList items={[]} onAddTracker={onAddTracker} getActions={() => []} />);

    await user.click(screen.getByRole("button", { name: "Add tracker" }));

    expect(onAddTracker).toHaveBeenCalledOnce();
  });
});
