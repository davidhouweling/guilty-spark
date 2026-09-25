import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CapabilityPreview } from "../capability-preview";

describe("CapabilityPreview", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it("starts on the matchmaking overlay preview with its source label", () => {
    render(<CapabilityPreview gamertag="soundmanD" sourceLabel="soundmanD" isExample previewMode="player" />);

    expect(screen.getByRole("tab", { name: "Matchmaking overlay" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Example preview · soundmanD")).toBeInTheDocument();
    expect(screen.getByText("Matchmaking")).toBeInTheDocument();
  });

  it("switches between capability tabs", async () => {
    const user = userEvent.setup();
    render(<CapabilityPreview gamertag="ChiefSpartan" sourceLabel="ChiefSpartan" isExample={false} previewMode="observer" />);

    await user.click(screen.getByRole("tab", { name: "Series overlay" }));
    expect(screen.getByText("Series 2 - 1")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Viewer" }));
    expect(screen.getByRole("tab", { name: "Viewer" })).toHaveAttribute("aria-selected", "true");
  });

  it("supports internal overlay and viewer interactions", async () => {
    const user = userEvent.setup();
    render(<CapabilityPreview gamertag="soundmanD" sourceLabel="soundmanD" isExample previewMode="player" />);

    await user.click(screen.getByRole("button", { name: /Game 1/ }));
    expect(screen.getByRole("button", { name: /Game 1/ })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Viewer" }));
    const match = screen.getByRole("button", { name: /Series Series 2 - 1/ });
    await user.click(match);
    expect(match).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Loading series stats...")).toBeInTheDocument();
  });
});
