import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { ReactElement } from "react";
import { SettingsDialog } from "../settings-dialog";
import { SettingsDialogFrame } from "../settings-dialog-frame";
import { DEFAULT_ALL_SETTINGS } from "../types";

afterEach(cleanup);

function RemountingSettingsDialog(): ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const [isStreamerMode, setIsStreamerMode] = useState(false);
  const dialog = isOpen ? (
    <SettingsDialogFrame
      title="Overlay Settings"
      onClose={(): void => {
        setIsOpen(false);
      }}
    >
      <button
        type="button"
        onClick={(): void => {
          setIsStreamerMode(true);
        }}
      >
        Switch display mode
      </button>
      <button
        type="button"
        onClick={(): void => {
          setIsOpen(false);
        }}
      >
        Close settings
      </button>
    </SettingsDialogFrame>
  ) : null;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label="Open overlay settings"
        onClick={(): void => {
          setIsOpen(true);
        }}
      >
        Settings
      </button>
      {isStreamerMode ? <section>{dialog}</section> : <div>{dialog}</div>}
    </>
  );
}

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

  it("returns focus to the current settings trigger after the dialog remounts across display modes", () => {
    render(<RemountingSettingsDialog />);
    const trigger = screen.getByRole("button", { name: "Open overlay settings" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Switch display mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(trigger).toHaveFocus();
  });
});
