import "@testing-library/jest-dom/vitest";

import type { ReactElement } from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OVERLAY_DESIGN_WIDTH, usePreviewScale } from "../use-preview-scale";

class MockResizeObserver implements ResizeObserver {
  public static instance: MockResizeObserver | undefined;
  private readonly callback: ResizeObserverCallback;
  public readonly disconnect = vi.fn<ResizeObserver["disconnect"]>();
  public readonly observe = vi.fn<ResizeObserver["observe"]>();
  public readonly unobserve = vi.fn<ResizeObserver["unobserve"]>();

  public constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instance = this;
  }

  public takeRecords(): ResizeObserverEntry[] {
    return [];
  }

  public trigger(): void {
    this.callback([], this);
  }
}

function PreviewScaleHarness(): ReactElement {
  const { containerRef, scale } = usePreviewScale();
  return <div ref={containerRef} data-testid="preview" style={{ transform: `scale(${String(scale)})` }} />;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  MockResizeObserver.instance = undefined;
});

describe("usePreviewScale", () => {
  it("updates the canvas scale on resize, handles zero width, and disconnects", async () => {
    let width = OVERLAY_DESIGN_WIDTH / 2;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      (): DOMRect => new DOMRect(0, 0, width, 540),
    );
    vi.stubGlobal("ResizeObserver", MockResizeObserver);

    const { unmount } = render(<PreviewScaleHarness />);
    expect(screen.getByTestId("preview")).toHaveStyle({ transform: "scale(0.5)" });

    const observer = MockResizeObserver.instance;
    if (observer === undefined) {
      throw new Error("Expected preview scale ResizeObserver");
    }

    width = OVERLAY_DESIGN_WIDTH / 4;
    act(() => {
      observer.trigger();
    });
    await waitFor(() => {
      expect(screen.getByTestId("preview")).toHaveStyle({ transform: "scale(0.25)" });
    });

    width = 0;
    act(() => {
      observer.trigger();
    });
    await waitFor(() => {
      expect(screen.getByTestId("preview")).toHaveStyle({ transform: "scale(1)" });
    });

    unmount();
    expect(observer.disconnect).toHaveBeenCalledOnce();
  });
});
