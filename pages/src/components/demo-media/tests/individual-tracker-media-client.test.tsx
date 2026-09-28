import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IndividualTrackerMediaClient } from "../individual-tracker-media-client";

afterEach(() => {
  cleanup();
});

describe("IndividualTrackerMediaClient", () => {
  it("exposes each preview region as a keyboard-focusable button with an accessible label", () => {
    render(<IndividualTrackerMediaClient />);

    const previewRegion = screen.getByRole("button", {
      name: "Inspect screenshot: Individual Tracker streamer settings with viewer and overlay URL controls",
    });

    expect(previewRegion).toHaveAttribute("tabindex", "0");
  });

  it("shows and hides the active preview on focus and blur", () => {
    const { container } = render(<IndividualTrackerMediaClient />);

    const previewRegion = screen.getByRole("button", {
      name: "Inspect screenshot: Individual Tracker streamer settings with viewer and overlay URL controls",
    });
    const activePreview = container.querySelector('[data-zoomed="true"]');

    expect(activePreview).not.toBeInTheDocument();

    fireEvent.focus(previewRegion);

    expect(container.querySelector('[data-zoomed="true"]')).toBeInTheDocument();

    fireEvent.blur(previewRegion);

    expect(container.querySelector('[data-zoomed="true"]')).not.toBeInTheDocument();
  });
});
