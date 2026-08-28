import type { TimelineGanttRowViewModel } from "../types";

export function aFakeTimelineGanttRowWith(
  overrides: Partial<TimelineGanttRowViewModel> = {},
): TimelineGanttRowViewModel {
  return {
    rowIndex: 1,
    label: "Hill 1",
    subLabel: "Eagle 50% · Cobra 33%",
    segments: [
      { startMs: 0, endMs: 15000, teamId: 0, color: "#0000ff" },
      { startMs: 15000, endMs: 25000, teamId: 1, color: "#ff0000" },
      { startMs: 25000, endMs: 30000, teamId: null, color: null },
    ],
    winnerColor: "#ff0000",
    tooltipTitle: "Hill 1",
    tooltipEntries: [
      { key: "0", color: "#0000ff", text: "Eagle: 50%" },
      { key: "1", color: "#ff0000", text: "Cobra: 33%" },
    ],
    ...overrides,
  };
}
