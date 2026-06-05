import "@testing-library/jest-dom/vitest";

import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StatsPanel } from "../stats-panel";

afterEach(() => {
  cleanup();
});

describe("StatsPanel", () => {
  function renderPanel(overrides: { isPanelOpen?: boolean; onClosePanel?: () => void } = {}): void {
    const nodeRef = createRef<HTMLDivElement>();
    render(
      <StatsPanel
        isPanelOpen={overrides.isPanelOpen ?? true}
        nodeRef={nodeRef}
        onClosePanel={overrides.onClosePanel ?? vi.fn()}
        panelContent={<div>Panel content</div>}
      />,
    );
  }

  it("renders panel content when open", () => {
    renderPanel({ isPanelOpen: true });
    expect(screen.getByText("Panel content")).toBeInTheDocument();
  });

  it("does not render panel content when closed", () => {
    renderPanel({ isPanelOpen: false });
    expect(screen.queryByText("Panel content")).not.toBeInTheDocument();
  });

  it("renders a close button with accessible label", () => {
    renderPanel({ isPanelOpen: true });
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
  });

  it("calls onClosePanel when the close button is clicked", () => {
    const onClosePanel = vi.fn();
    renderPanel({ isPanelOpen: true, onClosePanel });
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClosePanel).toHaveBeenCalledOnce();
  });

  it("calls onClosePanel when the backdrop is clicked", () => {
    const onClosePanel = vi.fn();
    renderPanel({ isPanelOpen: true, onClosePanel });
    const panelContent = screen.getByText("Panel content");
    const backdrop = panelContent.closest("[class]")?.parentElement;
    if (backdrop) {
      fireEvent.click(backdrop);
    }
    expect(onClosePanel).toHaveBeenCalledOnce();
  });
});
