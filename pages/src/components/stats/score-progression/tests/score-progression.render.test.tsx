import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ScoreProgression } from "../score-progression";
import type { ScoreLinesViewModel, ScoreMarkerData } from "../types";

afterEach(() => {
  cleanup();
});

vi.mock("../progression-chart/progression-chart", () => ({
  ProgressionChart: (): React.ReactElement => <div data-testid="progression-chart" />,
}));

vi.mock("../delta-chart/delta-chart", () => ({
  DeltaChart: (): React.ReactElement => <div data-testid="delta-chart" />,
}));

vi.mock("../timeline-gantt-chart/timeline-gantt-chart", () => ({
  TimelineGanttChart: (): React.ReactElement => <div data-testid="timeline-gantt-chart" />,
}));

const aFakeMarker = (): ScoreMarkerData => ({
  timestampMs: 30000,
  score: 10,
  teamId: 0,
  teamName: "Eagle",
  color: "#f00",
  kind: "capture",
});

function aScoreLinesViewModelWith(overrides: Partial<ScoreLinesViewModel> = {}): ScoreLinesViewModel {
  return {
    kind: "score-lines",
    ariaLabel: "test chart",
    effectiveChartType: "progression",
    hasDelta: false,
    hasPlayerAdvantage: false,
    hasMarkers: false,
    hasZoneAdvantage: false,
    showPlayerAdvantage: false,
    showMarkers: true,
    showZoneAdvantage: false,
    showToolbar: false,
    deltaViewModel: null,
    progressionViewModel: {
      durationMs: 600000,
      teamLines: [],
      playerAdvantage: null,
      zoneAdvantage: null,
      advantageDomain: null,
      markers: null,
      tooltipFormatter: (value: unknown): [string, string] => [String(value), ""],
    },
    onChartTypeChange: vi.fn<(value: string) => void>(),
    onPlayerAdvantageChange: vi.fn<(checked: boolean) => void>(),
    onMarkersChange: vi.fn<(checked: boolean) => void>(),
    onZoneAdvantageChange: vi.fn<(checked: boolean) => void>(),
    ...overrides,
  };
}

describe("ScoreProgression", () => {
  it("renders the capture and secure legend when markers are shown", () => {
    const model = aScoreLinesViewModelWith();
    render(
      <ScoreProgression
        {...model}
        progressionViewModel={{ ...model.progressionViewModel, markers: [aFakeMarker()] }}
      />,
    );
    expect(screen.getByText("Capture")).toBeInTheDocument();
    expect(screen.getByText("Secure")).toBeInTheDocument();
  });

  it("renders no marker legend when markers are hidden", () => {
    render(<ScoreProgression {...aScoreLinesViewModelWith()} />);
    expect(screen.queryByText("Capture")).not.toBeInTheDocument();
    expect(screen.queryByText("Secure")).not.toBeInTheDocument();
  });
});
