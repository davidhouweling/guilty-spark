import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StreamerConnectionsSectionView } from "../streamer-connections";

afterEach(() => {
  cleanup();
});

describe("StreamerConnectionsSectionView", () => {
  it("shows warning when no xbox xuid is available", () => {
    render(<StreamerConnectionsSectionView xboxXuid={null} />);

    expect(screen.getByText(/no active xbox identity is linked/i)).toBeInTheDocument();
  });

  it("renders stable xuid viewer and overlay urls", () => {
    render(<StreamerConnectionsSectionView xboxXuid="2533274844642438" />);

    expect(screen.getByDisplayValue(/\/individual-tracker\/2533274844642438\/view/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/\/individual-tracker\/2533274844642438\/overlay/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open viewer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open overlay" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Copy" })).toHaveLength(2);
  });

  it("invokes open callbacks with xuid", () => {
    const onOpenView = vi.fn<(xuid: string) => void>();
    const onOpenOverlay = vi.fn<(xuid: string) => void>();

    render(
      <StreamerConnectionsSectionView
        xboxXuid="2533274844642438"
        onOpenView={onOpenView}
        onOpenOverlay={onOpenOverlay}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open viewer" }));
    fireEvent.click(screen.getByRole("button", { name: "Open overlay" }));

    expect(onOpenView).toHaveBeenCalledWith("2533274844642438");
    expect(onOpenOverlay).toHaveBeenCalledWith("2533274844642438");
  });
});
