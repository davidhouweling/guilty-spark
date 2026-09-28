import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HoverZoom } from "../hover-zoom";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("HoverZoom", () => {
  it("renders children inside a keyboard-focusable region with an accessible label", () => {
    render(
      <HoverZoom ariaLabel="Inspect chart">
        <p>chart content</p>
      </HoverZoom>,
    );

    const region = screen.getByRole("button", { name: "Inspect chart" });

    expect(region).toHaveAttribute("tabindex", "0");
    expect(screen.getByText("chart content")).toBeInTheDocument();
  });

  it("renders the hint only when supplied", () => {
    const { rerender } = render(
      <HoverZoom ariaLabel="Inspect chart">
        <p>chart content</p>
      </HoverZoom>,
    );

    expect(screen.queryByText("Hover to inspect")).not.toBeInTheDocument();

    rerender(
      <HoverZoom ariaLabel="Inspect chart" hint="Hover to inspect">
        <p>chart content</p>
      </HoverZoom>,
    );

    expect(screen.getByText("Hover to inspect")).toBeInTheDocument();
  });

  it("zooms on focus and unzooms on blur", () => {
    const { container } = render(
      <HoverZoom ariaLabel="Inspect chart">
        <p>chart content</p>
      </HoverZoom>,
    );

    const region = screen.getByRole("button", { name: "Inspect chart" });

    expect(container.querySelector('[data-zoomed="true"]')).not.toBeInTheDocument();

    fireEvent.focus(region);

    expect(container.querySelector('[data-zoomed="true"]')).toBeInTheDocument();

    fireEvent.blur(region);

    expect(container.querySelector('[data-zoomed="true"]')).not.toBeInTheDocument();
  });

  it("keeps the zoom when focus moves to a descendant", () => {
    const { container } = render(
      <HoverZoom ariaLabel="Inspect chart">
        <button type="button">inner action</button>
      </HoverZoom>,
    );

    const region = screen.getByRole("button", { name: "Inspect chart" });
    const innerButton = screen.getByRole("button", { name: "inner action" });

    fireEvent.focus(region);
    expect(container.querySelector('[data-zoomed="true"]')).toBeInTheDocument();

    fireEvent.blur(region, { relatedTarget: innerButton });

    expect(container.querySelector('[data-zoomed="true"]')).toBeInTheDocument();
  });

  it("clears the delayed exit timer when unmounted before it fires", () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout");

    const { unmount } = render(
      <HoverZoom ariaLabel="Inspect chart" exitDelayMs={300}>
        <p>chart content</p>
      </HoverZoom>,
    );

    const region = screen.getByRole("button", { name: "Inspect chart" });

    fireEvent.mouseEnter(region);
    fireEvent.mouseLeave(region);

    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not intercept keyboard activation of interactive descendants", () => {
    const onInnerClick = vi.fn();
    const { container } = render(
      <HoverZoom ariaLabel="Inspect chart">
        <button type="button" onClick={onInnerClick}>
          inner action
        </button>
      </HoverZoom>,
    );

    const innerButton = screen.getByRole("button", { name: "inner action" });
    const enterEvent = fireEvent.keyDown(innerButton, { key: "Enter" });

    expect(enterEvent).toBe(true);
    expect(container.querySelector('[data-zoomed="true"]')).not.toBeInTheDocument();
  });

  it("exits the zoom on Escape while a descendant has focus", () => {
    const { container } = render(
      <HoverZoom ariaLabel="Inspect chart">
        <button type="button">inner action</button>
      </HoverZoom>,
    );

    const region = screen.getByRole("button", { name: "Inspect chart" });
    const innerButton = screen.getByRole("button", { name: "inner action" });

    fireEvent.focus(region);
    expect(container.querySelector('[data-zoomed="true"]')).toBeInTheDocument();

    fireEvent.keyDown(innerButton, { key: "Escape" });

    expect(container.querySelector('[data-zoomed="true"]')).not.toBeInTheDocument();
  });

  it("supports Enter, Space, and Escape keyboard interactions", () => {
    const { container } = render(
      <HoverZoom ariaLabel="Inspect chart">
        <p>chart content</p>
      </HoverZoom>,
    );

    const region = screen.getByRole("button", { name: "Inspect chart" });

    fireEvent.keyDown(region, { key: "Enter" });
    expect(container.querySelector('[data-zoomed="true"]')).toBeInTheDocument();

    fireEvent.keyDown(region, { key: "Escape" });
    expect(container.querySelector('[data-zoomed="true"]')).not.toBeInTheDocument();

    fireEvent.keyDown(region, { key: " " });
    expect(container.querySelector('[data-zoomed="true"]')).toBeInTheDocument();
  });

  it("delays unzooming when the pointer leaves", () => {
    vi.useFakeTimers();

    const { container } = render(
      <HoverZoom ariaLabel="Inspect chart" exitDelayMs={300}>
        <p>chart content</p>
      </HoverZoom>,
    );

    const region = screen.getByRole("button", { name: "Inspect chart" });

    fireEvent.mouseEnter(region);
    fireEvent.mouseLeave(region);

    expect(container.querySelector('[data-zoomed="true"]')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(container.querySelector('[data-zoomed="true"]')).not.toBeInTheDocument();
  });

  it("tracks the pointer position as the zoom origin", () => {
    const { container } = render(
      <HoverZoom ariaLabel="Inspect chart">
        <p>chart content</p>
      </HoverZoom>,
    );

    const region = screen.getByRole("button", { name: "Inspect chart" });

    vi.spyOn(region, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 200, 100));

    fireEvent.mouseMove(region, { clientX: 150, clientY: 25 });

    const content = container.querySelector<HTMLElement>("[data-zoomed]");

    expect(content?.style.transformOrigin).toBe("75% 25%");
  });
});
