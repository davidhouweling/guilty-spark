import { describe, expect, it, vi, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRotatingBackgroundTick } from "../use-rotating-background-tick";

describe("useRotatingBackgroundTick", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at tick 0 with no transition or glitch in progress", () => {
    const { result } = renderHook(() => useRotatingBackgroundTick());

    expect(result.current).toEqual({ tick: 0, isTransitioning: false, isGlitching: false });
  });

  it("advances the tick and enters transition/glitch state once the rotation interval elapses", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRotatingBackgroundTick());

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.tick).toBe(1);
    expect(result.current.isTransitioning).toBe(true);
    expect(result.current.isGlitching).toBe(true);
  });

  it("clears the glitch state before the transition state, matching their independent durations", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRotatingBackgroundTick());

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.isGlitching).toBe(true);
    expect(result.current.isTransitioning).toBe(true);

    act(() => {
      vi.advanceTimersByTime(260);
    });
    expect(result.current.isGlitching).toBe(false);
    expect(result.current.isTransitioning).toBe(true);

    act(() => {
      vi.advanceTimersByTime(900 - 260);
    });
    expect(result.current.isTransitioning).toBe(false);
  });

  it("advances the tick again on each subsequent rotation interval", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRotatingBackgroundTick());

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.tick).toBe(1);

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current.tick).toBe(2);
  });

  it("clears timers on unmount without throwing", () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useRotatingBackgroundTick());

    expect(() => {
      unmount();
      vi.advanceTimersByTime(20_000);
    }).not.toThrow();
  });
});
