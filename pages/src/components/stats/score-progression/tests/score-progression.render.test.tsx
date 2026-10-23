import "@testing-library/jest-dom/vitest";

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ScoreProgression } from "../score-progression";
import type { FlagRunsViewModel, ScoreLinesViewModel, ScoreMarkerData } from "../types";
import { aFakeFlagRunDataWith } from "../fakes/flag-run-data.fake";

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

vi.mock("../flag-runs-chart/flag-runs-chart", () => ({
  FlagRunsChart: (): React.ReactElement => <div data-testid="flag-runs-chart" />,
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
    chartTypeOptions: [{ value: "progression", label: "Score Progression" }],
    showChartTypeSelect: false,
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
      roundBoundaries: [],
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

  it("renders the chart-type select above the timeline gantt when other chart types are offered", () => {
    render(
      <ScoreProgression
        kind="timeline-gantt"
        ariaLabel="test chart"
        effectiveChartType="timeline"
        chartTypeOptions={[
          { value: "timeline", label: "Objective Timeline" },
          { value: "progression", label: "Score Progression" },
        ]}
        showChartTypeSelect={true}
        timeline={{ durationMs: 600000, rows: [] }}
        onChartTypeChange={vi.fn<(value: string) => void>()}
      />,
    );
    expect(screen.getByLabelText("Chart type")).toBeInTheDocument();
    expect(screen.getByText("Objective Timeline")).toBeInTheDocument();
  });

  it("renders no chart-type select above the timeline gantt when it is the only chart type", () => {
    render(
      <ScoreProgression
        kind="timeline-gantt"
        ariaLabel="test chart"
        effectiveChartType="timeline"
        chartTypeOptions={[{ value: "timeline", label: "Objective Timeline" }]}
        showChartTypeSelect={false}
        timeline={{ durationMs: 600000, rows: [] }}
        onChartTypeChange={vi.fn<(value: string) => void>()}
      />,
    );
    expect(screen.queryByLabelText("Chart type")).not.toBeInTheDocument();
  });
});

describe("ScoreProgression flag runs", () => {
  function aFlagRunsViewModelWith(overrides: Partial<FlagRunsViewModel> = {}): FlagRunsViewModel {
    return {
      kind: "flag-runs",
      ariaLabel: "flag chart",
      effectiveChartType: "timeline",
      chartTypeOptions: [{ value: "timeline", label: "Flag Runs" }],
      showChartTypeSelect: false,
      legend: [{ key: "flag-0", color: "#ff0000", text: "Above: Eagle's flag, carried by Cobra" }],
      chart: {
        durationMs: 120000,
        runs: [aFakeFlagRunDataWith()],
        tooltipFormatter: (value: unknown): [string, string] => [String(value), ""],
      },
      onChartTypeChange: (): void => undefined,
      ...overrides,
    };
  }

  it("renders the flag runs chart with its legends", () => {
    render(<ScoreProgression {...aFlagRunsViewModelWith()} />);

    expect(screen.getByTestId("flag-runs-chart")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "flag chart" })).toBeInTheDocument();
    expect(screen.getByText("Above: Eagle's flag, carried by Cobra")).toBeInTheDocument();
    expect(screen.getByText("Carrier killed")).toBeInTheDocument();
    expect(screen.queryByLabelText("Chart type")).not.toBeInTheDocument();
  });

  it("shows the chart type select when score charts are available", () => {
    render(
      <ScoreProgression
        {...aFlagRunsViewModelWith({
          showChartTypeSelect: true,
          chartTypeOptions: [
            { value: "timeline", label: "Flag Runs" },
            { value: "progression", label: "Score Progression" },
          ],
        })}
      />,
    );

    expect(screen.getByLabelText("Chart type")).toBeInTheDocument();
  });
});
