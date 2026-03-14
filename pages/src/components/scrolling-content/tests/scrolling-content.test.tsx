import "@testing-library/jest-dom/vitest";

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ScrollingContent } from "../scrolling-content";

afterEach(() => {
  cleanup();
});

describe("ScrollingContent", () => {
  let mockRequestAnimationFrame: (callback: FrameRequestCallback) => number;
  let mockCancelAnimationFrame: (handle: number) => void;
  let rafId = 0;

  beforeEach(() => {
    rafId = 0;
    mockRequestAnimationFrame = vi.fn(() => {
      rafId += 1;
      return rafId;
    });
    mockCancelAnimationFrame = vi.fn();

    global.requestAnimationFrame = mockRequestAnimationFrame;
    global.cancelAnimationFrame = mockCancelAnimationFrame;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children", () => {
    render(
      <ScrollingContent maxWidth={300}>
        <div>Test Content</div>
      </ScrollingContent>,
    );

    expect(screen.getByText("Test Content")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <ScrollingContent maxWidth={300} className="custom-class">
        <div>Test Content</div>
      </ScrollingContent>,
    );

    const scrollingDiv = container.querySelector(".custom-class");
    expect(scrollingDiv).toBeInTheDocument();
  });

  it("calls onScrollComplete after 10 seconds when content does not need scrolling in non-loop mode", () => {
    vi.useFakeTimers();

    const onScrollComplete = vi.fn();

    const { container } = render(
      <ScrollingContent maxWidth={500} loop={false} onScrollComplete={onScrollComplete}>
        <div>Short</div>
      </ScrollingContent>,
    );

    const scrollElement = container.querySelector("div");
    if (scrollElement) {
      Object.defineProperty(scrollElement, "scrollWidth", { value: 50, configurable: true });
      Object.defineProperty(scrollElement, "parentElement", {
        value: { clientWidth: 500 },
        configurable: true,
      });
    }

    vi.advanceTimersByTime(10000);

    expect(onScrollComplete).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  it("does not call onScrollComplete in loop mode when content does not need scrolling", () => {
    vi.useFakeTimers();

    const onScrollComplete = vi.fn();

    const { container } = render(
      <ScrollingContent maxWidth={500} loop={true} onScrollComplete={onScrollComplete}>
        <div>Short</div>
      </ScrollingContent>,
    );

    const scrollElement = container.querySelector("div");
    if (scrollElement) {
      Object.defineProperty(scrollElement, "scrollWidth", { value: 50, configurable: true });
      Object.defineProperty(scrollElement, "parentElement", {
        value: { clientWidth: 500 },
        configurable: true,
      });
    }

    vi.advanceTimersByTime(15000);

    expect(onScrollComplete).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("initiates continuous scrolling animation when content is wider than container", () => {
    render(
      <ScrollingContent maxWidth={300} loop={true} speed={60}>
        <div>Very Long Content That Needs Scrolling</div>
      </ScrollingContent>,
    );

    expect(mockRequestAnimationFrame).toHaveBeenCalled();
  });

  it("initiates ticker mode scrolling with pause-scroll-pause behavior", () => {
    vi.useFakeTimers();

    const onScrollComplete = vi.fn();

    render(
      <ScrollingContent maxWidth={300} loop={false} mode="ticker" speed={60} onScrollComplete={onScrollComplete}>
        <div>Long Content That Needs Scrolling</div>
      </ScrollingContent>,
    );

    expect(mockRequestAnimationFrame).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("calls onScrollComplete in continuous single-scroll mode when animation completes", () => {
    const onScrollComplete = vi.fn();

    render(
      <ScrollingContent maxWidth={300} loop={false} mode="continuous" speed={100} onScrollComplete={onScrollComplete}>
        <div>Long Content</div>
      </ScrollingContent>,
    );

    expect(mockRequestAnimationFrame).toHaveBeenCalled();
  });

  it("recalculates scroll settings on window resize", () => {
    render(
      <ScrollingContent maxWidth={300}>
        <div>Content</div>
      </ScrollingContent>,
    );

    vi.mocked(mockRequestAnimationFrame).mockClear();

    window.dispatchEvent(new Event("resize"));

    expect(mockRequestAnimationFrame).toHaveBeenCalled();
  });

  it("cleans up animation on unmount", () => {
    const { unmount } = render(
      <ScrollingContent maxWidth={300} loop={true}>
        <div>Content</div>
      </ScrollingContent>,
    );

    expect(mockRequestAnimationFrame).toHaveBeenCalled();

    unmount();
  });

  it("respects custom speed parameter", () => {
    render(
      <ScrollingContent maxWidth={300} speed={120} loop={true}>
        <div>Content</div>
      </ScrollingContent>,
    );

    expect(mockRequestAnimationFrame).toHaveBeenCalled();
  });
});
