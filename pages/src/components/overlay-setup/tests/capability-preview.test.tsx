import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CapabilityPreview } from "../capability-preview";

describe("CapabilityPreview", () => {
  afterEach(() => {
    cleanup();
  });

  it("starts on the matchmaking overlay preview with its source label", () => {
    render(<CapabilityPreview gamertag="soundmanD" sourceLabel="soundmanD" isExample />);

    expect(screen.getByRole("tab", { name: "Matchmaking overlay" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Example preview · soundmanD")).toBeInTheDocument();
    expect(screen.getByText("MATCHMAKING")).toBeInTheDocument();
  });

  it("switches between capability tabs", async () => {
    const user = userEvent.setup();
    render(<CapabilityPreview gamertag="ChiefSpartan" sourceLabel="ChiefSpartan" isExample={false} />);

    await user.click(screen.getByRole("tab", { name: "Series overlay" }));
    expect(screen.getByText("SERIES 2 - 1")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Viewer" }));
    expect(screen.getByText("PUBLIC VIEWER")).toBeInTheDocument();
  });

  it("supports internal overlay and viewer interactions", async () => {
    const user = userEvent.setup();
    render(<CapabilityPreview gamertag="soundmanD" sourceLabel="soundmanD" isExample />);

    await user.click(screen.getByRole("button", { name: "Scoreboard" }));
    expect(screen.getByText("MATCH STATS")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Viewer" }));
    const match = screen.getByRole("button", { name: /Aquarius/ });
    await user.click(match);
    expect(match).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/KDA 1.72/)).toBeInTheDocument();
  });
});
