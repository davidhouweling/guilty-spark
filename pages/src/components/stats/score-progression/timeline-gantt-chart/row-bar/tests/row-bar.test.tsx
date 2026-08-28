import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { RowBar } from "../row-bar";
import { aFakeTimelineGanttRowWith } from "../../../fakes/timeline-gantt-row.fake";

afterEach(() => {
  cleanup();
});

const FAKE_BACKGROUND = { x: 0, y: 0, width: 300, height: 20 };

describe("RowBar", () => {
  it("returns null when background is not provided", () => {
    const { container } = render(
      <svg>
        <RowBar row={aFakeTimelineGanttRowWith()} durationMs={30000} y={0} height={20} />
      </svg>,
    );
    expect(container.querySelector("rect")).toBeNull();
  });

  it("renders a colored rect for each occupied segment", () => {
    const { container } = render(
      <svg>
        <RowBar row={aFakeTimelineGanttRowWith()} durationMs={30000} y={0} height={20} background={FAKE_BACKGROUND} />
      </svg>,
    );
    const rects = container.querySelectorAll("rect");
    const coloredRects = Array.from(rects).filter(
      (r) => r.getAttribute("fill") === "#0000ff" || r.getAttribute("fill") === "#ff0000",
    );
    expect(coloredRects).toHaveLength(2);
  });

  it("renders a rect for the unoccupied segment", () => {
    const { container } = render(
      <svg>
        <RowBar row={aFakeTimelineGanttRowWith()} durationMs={30000} y={0} height={20} background={FAKE_BACKGROUND} />
      </svg>,
    );
    const rects = container.querySelectorAll("rect");
    const unoccupied = Array.from(rects).filter(
      (r) => r.getAttribute("fill") !== "#0000ff" && r.getAttribute("fill") !== "#ff0000",
    );
    expect(unoccupied.length).toBeGreaterThan(0);
  });

  it("renders a winner indicator circle when winnerColor is set", () => {
    const { container } = render(
      <svg>
        <RowBar row={aFakeTimelineGanttRowWith()} durationMs={30000} y={0} height={20} background={FAKE_BACKGROUND} />
      </svg>,
    );
    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(1);
    expect(circles[0].getAttribute("fill")).toBe("#ff0000");
  });

  it("does not render a winner circle when winnerColor is null", () => {
    const { container } = render(
      <svg>
        <RowBar
          row={aFakeTimelineGanttRowWith({ winnerColor: null })}
          durationMs={30000}
          y={0}
          height={20}
          background={FAKE_BACKGROUND}
        />
      </svg>,
    );
    expect(container.querySelectorAll("circle")).toHaveLength(0);
  });

  it("clamps a segment that overruns the duration to the plot edge", () => {
    const row = aFakeTimelineGanttRowWith({
      segments: [{ startMs: 20000, endMs: 32000, teamId: 0, color: "#0000ff" }],
      winnerColor: null,
    });
    const { container } = render(
      <svg>
        <RowBar row={row} durationMs={30000} y={0} height={20} background={FAKE_BACKGROUND} />
      </svg>,
    );
    const rect = container.querySelector("rect");
    expect(Number(rect?.getAttribute("x"))).toBeCloseTo(200);
    expect(Number(rect?.getAttribute("width"))).toBeCloseTo(100);
  });

  it("skips a segment that starts at or beyond the duration", () => {
    const row = aFakeTimelineGanttRowWith({
      segments: [{ startMs: 30000, endMs: 32000, teamId: 0, color: "#0000ff" }],
      winnerColor: null,
    });
    const { container } = render(
      <svg>
        <RowBar row={row} durationMs={30000} y={0} height={20} background={FAKE_BACKGROUND} />
      </svg>,
    );
    expect(container.querySelector("rect")).toBeNull();
  });

  it("positions segments proportionally within the background width", () => {
    const row = aFakeTimelineGanttRowWith({
      segments: [{ startMs: 0, endMs: 15000, teamId: 0, color: "#0000ff" }],
      winnerColor: null,
    });
    const { container } = render(
      <svg>
        <RowBar row={row} durationMs={30000} y={0} height={20} background={{ x: 0, y: 0, width: 300, height: 20 }} />
      </svg>,
    );
    const rect = container.querySelector("rect");
    expect(Number(rect?.getAttribute("x"))).toBe(0);
    expect(Number(rect?.getAttribute("width"))).toBe(150);
  });
});
