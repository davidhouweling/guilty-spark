import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LiveTrackersOnboarding } from "../live-trackers-onboarding";

afterEach(() => {
  cleanup();
});

describe("LiveTrackersOnboarding", () => {
  it("renders the steps as an ordered list", () => {
    render(<LiveTrackersOnboarding />);

    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });
});
