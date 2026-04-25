import "@testing-library/jest-dom/vitest";

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TrackerListItem } from "../tracker-list";
import { TrackerList } from "../tracker-list";

describe("TrackerList", () => {
  it("renders empty state when no items are present", () => {
    const onAddTracker = vi.fn<() => void>();

    render(<TrackerList items={[]} onAddTracker={onAddTracker} getActions={() => []} />);

    expect(screen.getByText("No trackers yet. Start with your linked gamertag above.")).toBeInTheDocument();
    expect(screen.getByText("How individual tracking works")).toBeInTheDocument();
  });

  it("renders tracker row with status and live badge", () => {
    const item: TrackerListItem = {
      trackerId: "tracker-1",
      gamertag: "Chief",
      status: "active",
      isLive: true,
      isPinned: false,
    };

    render(
      <TrackerList items={[item]} getActions={() => [{ label: "View tracker", onClick: (): void => undefined }]} />,
    );

    expect(screen.getByText("Chief")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("requests actions for each tracker row", () => {
    const item: TrackerListItem = {
      trackerId: "tracker-1",
      gamertag: "Chief",
      status: "paused",
      isLive: false,
      isPinned: true,
    };

    const getActions = vi.fn<(item: TrackerListItem) => readonly { label: string; onClick: () => void }[]>(() => [
      { label: "Resume", onClick: (): void => undefined },
    ]);

    render(<TrackerList items={[item]} getActions={getActions} />);

    expect(getActions).toHaveBeenCalledWith(item);
    expect(getActions).toHaveBeenCalledOnce();
  });
});
