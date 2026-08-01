import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { HillBar } from "../hill-bar";
import type { KothHillData } from "../../../types";

afterEach(() => {
  cleanup();
});

function aFakeHill(overrides: Partial<KothHillData> = {}): KothHillData {
  return {
    hillIndex: 1,
    startMs: 0,
    endMs: 30000,
    segments: [
      { startMs: 0, endMs: 15000, teamId: 0, color: "#0000ff" },
      { startMs: 15000, endMs: 25000, teamId: 1, color: "#ff0000" },
      { startMs: 25000, endMs: 30000, teamId: null, color: null },
    ],
    winnerTeamId: 1,
    winnerColor: "#ff0000",
    winnerName: "Cobra",
    teamOccupancies: [
      { teamId: 0, name: "Eagle", color: "#0000ff", percentage: 50 },
      { teamId: 1, name: "Cobra", color: "#ff0000", percentage: 33 },
    ],
    ...overrides,
  };
}

const FAKE_BACKGROUND = { x: 0, y: 0, width: 300, height: 20 };

describe("HillBar", () => {
  it("returns null when background is not provided", () => {
    const { container } = render(
      <svg>
        <HillBar hill={aFakeHill()} durationMs={30000} y={0} height={20} />
      </svg>,
    );
    expect(container.querySelector("rect")).toBeNull();
  });

  it("renders a colored rect for each occupied segment", () => {
    const { container } = render(
      <svg>
        <HillBar hill={aFakeHill()} durationMs={30000} y={0} height={20} background={FAKE_BACKGROUND} />
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
        <HillBar hill={aFakeHill()} durationMs={30000} y={0} height={20} background={FAKE_BACKGROUND} />
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
        <HillBar hill={aFakeHill()} durationMs={30000} y={0} height={20} background={FAKE_BACKGROUND} />
      </svg>,
    );
    const circles = container.querySelectorAll("circle");
    expect(circles).toHaveLength(1);
    expect(circles[0].getAttribute("fill")).toBe("#ff0000");
  });

  it("does not render a winner circle when winnerColor is null", () => {
    const { container } = render(
      <svg>
        <HillBar
          hill={aFakeHill({ winnerTeamId: null, winnerColor: null, winnerName: null })}
          durationMs={30000}
          y={0}
          height={20}
          background={FAKE_BACKGROUND}
        />
      </svg>,
    );
    expect(container.querySelectorAll("circle")).toHaveLength(0);
  });

  it("positions segments proportionally within the background width", () => {
    const hill = aFakeHill({
      segments: [{ startMs: 0, endMs: 15000, teamId: 0, color: "#0000ff" }],
      winnerColor: null,
      winnerTeamId: null,
      winnerName: null,
    });
    const { container } = render(
      <svg>
        <HillBar hill={hill} durationMs={30000} y={0} height={20} background={{ x: 0, y: 0, width: 300, height: 20 }} />
      </svg>,
    );
    const rect = container.querySelector("rect");
    expect(Number(rect?.getAttribute("x"))).toBe(0);
    expect(Number(rect?.getAttribute("width"))).toBe(150);
  });
});
