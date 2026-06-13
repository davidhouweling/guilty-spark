import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TabbedSection } from "../tabbed-section";

describe("TabbedSection", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders all tab labels and selected panel content", () => {
    render(
      <TabbedSection
        tabListAriaLabel="Demo tabs"
        selectedTabId="players"
        onTabChange={() => undefined}
        tabs={[
          { id: "players", label: "Players", content: <div>Players panel</div> },
          { id: "kill-matrix", label: "Kill Matrix", content: <div>Kill matrix panel</div> },
        ]}
      />,
    );

    expect(screen.getByRole("tab", { name: "Players" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Players" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Kill Matrix" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Kill Matrix" })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByText("Players panel")).toBeVisible();
    expect(screen.queryByText("Kill matrix panel")).not.toBeVisible();
  });

  it("calls onTabChange when a tab is clicked", () => {
    const onTabChange = vi.fn<(tabId: "players" | "kill-matrix") => void>();

    render(
      <TabbedSection
        tabListAriaLabel="Demo tabs"
        selectedTabId="players"
        onTabChange={onTabChange}
        tabs={[
          { id: "players", label: "Players", content: <div>Players panel</div> },
          { id: "kill-matrix", label: "Kill Matrix", content: <div>Kill matrix panel</div> },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Kill Matrix" }));

    expect(onTabChange).toHaveBeenCalledOnce();
    expect(onTabChange).toHaveBeenCalledWith("kill-matrix");
  });

  it("calls onTabChange with the next tab on ArrowRight", () => {
    const onTabChange = vi.fn<(tabId: "players" | "kill-matrix") => void>();

    render(
      <TabbedSection
        tabListAriaLabel="Demo tabs"
        selectedTabId="players"
        onTabChange={onTabChange}
        tabs={[
          { id: "players", label: "Players", content: <div>Players panel</div> },
          { id: "kill-matrix", label: "Kill Matrix", content: <div>Kill matrix panel</div> },
        ]}
      />,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });

    expect(onTabChange).toHaveBeenCalledWith("kill-matrix");
  });

  it("calls onTabChange with the previous tab on ArrowLeft", () => {
    const onTabChange = vi.fn<(tabId: "players" | "kill-matrix") => void>();

    render(
      <TabbedSection
        tabListAriaLabel="Demo tabs"
        selectedTabId="kill-matrix"
        onTabChange={onTabChange}
        tabs={[
          { id: "players", label: "Players", content: <div>Players panel</div> },
          { id: "kill-matrix", label: "Kill Matrix", content: <div>Kill matrix panel</div> },
        ]}
      />,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowLeft" });

    expect(onTabChange).toHaveBeenCalledWith("players");
  });

  it("wraps from last to first tab on ArrowRight", () => {
    const onTabChange = vi.fn<(tabId: "players" | "kill-matrix") => void>();

    render(
      <TabbedSection
        tabListAriaLabel="Demo tabs"
        selectedTabId="kill-matrix"
        onTabChange={onTabChange}
        tabs={[
          { id: "players", label: "Players", content: <div>Players panel</div> },
          { id: "kill-matrix", label: "Kill Matrix", content: <div>Kill matrix panel</div> },
        ]}
      />,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });

    expect(onTabChange).toHaveBeenCalledWith("players");
  });

  it("moves to the first tab on Home", () => {
    const onTabChange = vi.fn<(tabId: "players" | "kill-matrix") => void>();

    render(
      <TabbedSection
        tabListAriaLabel="Demo tabs"
        selectedTabId="kill-matrix"
        onTabChange={onTabChange}
        tabs={[
          { id: "players", label: "Players", content: <div>Players panel</div> },
          { id: "kill-matrix", label: "Kill Matrix", content: <div>Kill matrix panel</div> },
        ]}
      />,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "Home" });

    expect(onTabChange).toHaveBeenCalledWith("players");
  });

  it("moves to the last tab on End", () => {
    const onTabChange = vi.fn<(tabId: "players" | "kill-matrix") => void>();

    render(
      <TabbedSection
        tabListAriaLabel="Demo tabs"
        selectedTabId="players"
        onTabChange={onTabChange}
        tabs={[
          { id: "players", label: "Players", content: <div>Players panel</div> },
          { id: "kill-matrix", label: "Kill Matrix", content: <div>Kill matrix panel</div> },
        ]}
      />,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "End" });

    expect(onTabChange).toHaveBeenCalledWith("kill-matrix");
  });

  it("does not call onTabChange on ArrowRight when tabs is empty", () => {
    const onTabChange = vi.fn<(tabId: never) => void>();

    render(
      <TabbedSection
        tabListAriaLabel="Demo tabs"
        selectedTabId={"players" as never}
        onTabChange={onTabChange}
        tabs={[]}
      />,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });

    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("does not call onTabChange on ArrowRight when selectedTabId is not in tabs", () => {
    const onTabChange = vi.fn<(tabId: "players" | "kill-matrix") => void>();

    render(
      <TabbedSection
        tabListAriaLabel="Demo tabs"
        selectedTabId={"unknown" as "players"}
        onTabChange={onTabChange}
        tabs={[
          { id: "players", label: "Players", content: <div>Players panel</div> },
          { id: "kill-matrix", label: "Kill Matrix", content: <div>Kill matrix panel</div> },
        ]}
      />,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });

    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("moves focus to the newly selected tab button on ArrowRight", () => {
    const onTabChange = vi.fn<(tabId: "players" | "kill-matrix") => void>();

    render(
      <TabbedSection
        tabListAriaLabel="Demo tabs"
        selectedTabId="players"
        onTabChange={onTabChange}
        tabs={[
          { id: "players", label: "Players", content: <div>Players panel</div> },
          { id: "kill-matrix", label: "Kill Matrix", content: <div>Kill matrix panel</div> },
        ]}
      />,
    );

    screen.getByRole("tab", { name: "Players" }).focus();
    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });

    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Kill Matrix" }));
  });

  it("does not call onTabChange when Alt key is held with ArrowRight", () => {
    const onTabChange = vi.fn<(tabId: "players" | "kill-matrix") => void>();

    render(
      <TabbedSection
        tabListAriaLabel="Demo tabs"
        selectedTabId="players"
        onTabChange={onTabChange}
        tabs={[
          { id: "players", label: "Players", content: <div>Players panel</div> },
          { id: "kill-matrix", label: "Kill Matrix", content: <div>Kill matrix panel</div> },
        ]}
      />,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight", altKey: true });

    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("does not call onTabChange when Ctrl key is held with ArrowRight", () => {
    const onTabChange = vi.fn<(tabId: "players" | "kill-matrix") => void>();

    render(
      <TabbedSection
        tabListAriaLabel="Demo tabs"
        selectedTabId="players"
        onTabChange={onTabChange}
        tabs={[
          { id: "players", label: "Players", content: <div>Players panel</div> },
          { id: "kill-matrix", label: "Kill Matrix", content: <div>Kill matrix panel</div> },
        ]}
      />,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight", ctrlKey: true });

    expect(onTabChange).not.toHaveBeenCalled();
  });

  it("does not call onTabChange when Meta key is held with ArrowRight", () => {
    const onTabChange = vi.fn<(tabId: "players" | "kill-matrix") => void>();

    render(
      <TabbedSection
        tabListAriaLabel="Demo tabs"
        selectedTabId="players"
        onTabChange={onTabChange}
        tabs={[
          { id: "players", label: "Players", content: <div>Players panel</div> },
          { id: "kill-matrix", label: "Kill Matrix", content: <div>Kill matrix panel</div> },
        ]}
      />,
    );

    fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight", metaKey: true });

    expect(onTabChange).not.toHaveBeenCalled();
  });
});
