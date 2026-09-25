import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OverlayUrlsSectionProps } from "../types";
import { createOverlayUrlsSection } from "../create";

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
  function renderSection(props: OverlayUrlsSectionProps): void {
    const OverlayUrlsSection = createOverlayUrlsSection();
    render(<OverlayUrlsSection {...props} />);
  }

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the overlay and viewer URLs when gamertag is provided", () => {
    vi.stubGlobal("location", { origin: "https://example.com" });
    renderSection(aFakeProps({ gamertag: "gamertag-abc" }));

    expect(screen.getByText("https://example.com/u/gamertag-abc")).toBeInTheDocument();
    expect(screen.getByText(/\/u\/gamertag-abc\/overlay/)).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("renders a warning alert when gamertag is null", () => {
    renderSection(aFakeProps({ gamertag: null }));

    expect(screen.getByText(/No active Xbox identity is linked/)).toBeInTheDocument();
  });

  it("renders a loading state while authentication is unresolved", () => {
    renderSection(aFakeProps({ gamertag: null, loading: true }));

    expect(screen.getByText("Checking your session…")).toBeInTheDocument();
    expect(screen.queryByText(/No active Xbox identity is linked/)).not.toBeInTheDocument();
  });

  it("does not render the auto-start toggle when gamertag is null", () => {
    renderSection(aFakeProps({ gamertag: null }));

    expect(
      screen.queryByRole("checkbox", { name: /automatically start tracking when the overlay is used/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the auto-start toggle when gamertag is provided", () => {
    renderSection(aFakeProps());

    expect(
      screen.getByRole("checkbox", { name: /automatically start tracking when the overlay is used/i }),
    ).toBeInTheDocument();
  });

  it("disables every action when disabled", () => {
    renderSection(aFakeProps({ disabled: true }));

    expect(screen.getAllByRole("button")).toHaveLength(5);
    for (const button of screen.getAllByRole("button")) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("prefixes the URLs with 'Example:' when disabled", () => {
    vi.stubGlobal("location", { origin: "https://example.com" });
    renderSection(aFakeProps({ gamertag: "343GuiltySpark", disabled: true }));

    expect(screen.getByText("Example: https://example.com/u/343GuiltySpark")).toBeInTheDocument();
    expect(screen.getByText(/^Example: .*\/overlay$/)).toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("does not prefix the URLs when not disabled", () => {
    vi.stubGlobal("location", { origin: "https://example.com" });
    renderSection(aFakeProps({ gamertag: "gamertag-abc" }));

    expect(screen.queryByText(/^Example:/)).not.toBeInTheDocument();

    vi.unstubAllGlobals();
  });

  it("keeps identity URL actions enabled while only settings are disabled", () => {
    renderSection(aFakeProps({ settingsDisabled: true }));

    expect(screen.getByRole("button", { name: "Copy overlay URL" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Open overlay" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Copy viewer URL" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Open viewer" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Open overlay with preview" })).toBeDisabled();
    expect(screen.getByRole("checkbox")).toBeDisabled();
  });

  it("calls onAutoStartChange when the auto-start toggle is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(enabled: boolean) => void>();

    renderSection(aFakeProps({ autoStart: false, onAutoStartChange: onChange }));

    await user.click(screen.getByRole("checkbox", { name: /automatically start tracking when the overlay is used/i }));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("calls the clipboard API when the overlay copy button is clicked", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("location", { origin: "https://example.com" });

    renderSection(aFakeProps({ gamertag: "gamertag-abc" }));

    await user.click(screen.getByRole("button", { name: "Copy overlay URL" }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/u/gamertag-abc/overlay"));

    vi.unstubAllGlobals();
  });

  it("calls the clipboard API when the viewer copy button is clicked", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    vi.stubGlobal("location", { origin: "https://example.com" });

    renderSection(aFakeProps({ gamertag: "gamertag-abc" }));

    await user.click(screen.getByRole("button", { name: "Copy viewer URL" }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("/u/gamertag-abc"));

    vi.unstubAllGlobals();
  });

  it("shows a copied state on the viewer copy button after a successful copy", async () => {
    const user = userEvent.setup({ delay: null });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined) },
    });
    vi.stubGlobal("location", { origin: "https://example.com" });

    renderSection(aFakeProps({ gamertag: "gamertag-abc" }));

    await user.click(screen.getByRole("button", { name: "Copy viewer URL" }));

    expect(screen.getByRole("button", { name: "Copied viewer URL" })).toBeInTheDocument();

    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens the overlay preview URL with the given preview color mode", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("location", { origin: "https://example.com" });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    renderSection(aFakeProps({ gamertag: "gamertag-abc", previewColorMode: "observer" }));

    await user.click(screen.getByRole("button", { name: "Open overlay with preview" }));

    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining("previewMode=observer"), "_blank");

    vi.unstubAllGlobals();
  });
});
