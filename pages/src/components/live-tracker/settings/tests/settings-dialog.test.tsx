import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SettingsDialog } from "../settings-dialog";
import { DEFAULT_ALL_SETTINGS } from "../types";

afterEach(cleanup);

describe("SettingsDialog", () => {
  it("retains live controls and callbacks while keeping keyboard focus inside the shared dialog", () => {
    const onClose = vi.fn();
    const onViewModeChange = vi.fn();
    const onSettingsChange = vi.fn();
    render(
      <SettingsDialog
        isOpen
        settings={DEFAULT_ALL_SETTINGS}
        viewMode="wide"
        onClose={onClose}
        onSettingsChange={onSettingsChange}
        onViewModeChange={onViewModeChange}
        onViewPreviewChange={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "Overlay Settings" });
    expect(screen.getByRole("heading", { name: "Team Colors" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Team Names" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Share Settings" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Streamer Overlay" }));
    expect(onViewModeChange).toHaveBeenCalledWith("streamer");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Finals" } });
    expect(onSettingsChange).toHaveBeenCalledWith({
      ...DEFAULT_ALL_SETTINGS,
      series: { ...DEFAULT_ALL_SETTINGS.series, titleOverride: "Finals" },
    });
    const buttons = dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
    const first = buttons.item(0);
    const last = buttons.item(buttons.length - 1);
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
