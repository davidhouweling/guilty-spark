import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OverlayUrlsSectionProps } from "../types";
import { OverlayUrlsSection } from "../overlay-urls";

function aFakeProps(overrides?: Partial<OverlayUrlsSectionProps>): OverlayUrlsSectionProps {
  return {
    gamertag: "gamertag-123",
    previewColorMode: "player",
    autoStart: true,
    onAutoStartChange: (): void => undefined,
    ...overrides,
  };
}

describe("OverlayUrlsSection", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the viewer and overlay URLs when gamertag is provided", () => {
    vi.stubGlobal("location", { origin: "https://example.com" });
    render(<OverlayUrlsSection {...aFakeProps({ gamertag: "gamertag-abc" })} />);

    expect(screen.getByText("https://example.com/u/gamertag-abc")).toBeInTheDocument();
    expect(screen.getByText(/\/u\/gamertag-abc\/overlay/)).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("renders a warning alert when gamertag is null", () => {
    render(<OverlayUrlsSection {...aFakeProps({ gamertag: null })} />);

    expect(screen.getByText(/No active Xbox identity is linked/)).toBeInTheDocument();
  });

  it("does not render the auto-start toggle when gamertag is null", () => {
    render(<OverlayUrlsSection {...aFakeProps({ gamertag: null })} />);

    expect(
      screen.queryByRole("checkbox", { name: /automatically start tracking when the overlay is used/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the auto-start toggle when gamertag is provided", () => {
    render(<OverlayUrlsSection {...aFakeProps()} />);

    expect(
      screen.getByRole("checkbox", { name: /automatically start tracking when the overlay is used/i }),
    ).toBeInTheDocument();
  });

  it("calls onAutoStartChange when the auto-start toggle is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(enabled: boolean) => void>();

    render(<OverlayUrlsSection {...aFakeProps({ autoStart: false, onAutoStartChange: onChange })} />);

    await user.click(screen.getByRole("checkbox", { name: /automatically start tracking when the overlay is used/i }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("calls the clipboard API when the view copy button is clicked", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("location", { origin: "https://example.com" });

    render(<OverlayUrlsSection {...aFakeProps({ gamertag: "gamertag-abc" })} />);

    const copyButtons = screen.getAllByRole("button", { name: "Copy" });
    await user.click(copyButtons[0]);

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/u/gamertag-abc"));

    vi.unstubAllGlobals();
  });

  it("shows Copied! on the view button after a successful copy", async () => {
    const user = userEvent.setup({ delay: null });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined) },
    });
    vi.stubGlobal("location", { origin: "https://example.com" });

    render(<OverlayUrlsSection {...aFakeProps({ gamertag: "gamertag-abc" })} />);

    const copyButtons = screen.getAllByRole("button", { name: "Copy" });
    await user.click(copyButtons[0]);

    expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens the overlay preview URL with the given preview color mode", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("location", { origin: "https://example.com" });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<OverlayUrlsSection {...aFakeProps({ gamertag: "gamertag-abc", previewColorMode: "observer" })} />);

    await user.click(screen.getByRole("button", { name: "Open overlay with preview" }));

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("previewMode=observer"),
      "_blank",
    );

    vi.unstubAllGlobals();
  });
});
