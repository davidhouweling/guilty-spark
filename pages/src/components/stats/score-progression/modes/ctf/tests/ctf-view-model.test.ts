import { describe, expect, it } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aFakeCtfTimelineWith } from "../fakes/ctf-timeline.fake";
import { buildFlagRunLegend, buildFlagRuns, buildFlagRunsChartPoints, progressAt } from "../ctf-view-model";

const TEAM_IDS = [0, 1] as const;
const COLORS = new Map([
  [0, "#0000ff"],
  [1, "#ff0000"],
]);
const DURATION_MS = 120000;

describe("buildFlagRuns", () => {
  it("builds one run per flag pull, coloured by the carrying team", () => {
    const runs = buildFlagRuns(aFakeCtfTimelineWith(), TEAM_IDS, COLORS, DURATION_MS);
    expect(runs.map((run) => [run.runIndex, run.seriesName, run.color])).toEqual([
      [1, "Eagle flag · Cobra carrying", "#ff0000"],
      [2, "Cobra flag · Eagle carrying", "#0000ff"],
    ]);
  });

  it("signs progress by which flag is out and pins a capture to full progress", () => {
    const [captured, returned] = buildFlagRuns(aFakeCtfTimelineWith(), TEAM_IDS, COLORS, DURATION_MS);
    expect(captured.points).toEqual([
      { timestampMs: 20000, progress: 0 },
      { timestampMs: 30000, progress: 25 },
      { timestampMs: 45000, progress: 60 },
      { timestampMs: 60000, progress: 100 },
    ]);
    expect(returned.points).toEqual([
      { timestampMs: 70000, progress: 0 },
      { timestampMs: 80000, progress: -50 },
      { timestampMs: 90000, progress: -86 },
      { timestampMs: 100000, progress: -86 },
    ]);
  });

  it("places markers at the flag's progress when each event happened", () => {
    const [captured, returned] = buildFlagRuns(aFakeCtfTimelineWith(), TEAM_IDS, COLORS, DURATION_MS);
    expect(captured.markers).toEqual([
      { timestampMs: 20000, progress: 0, kind: "steal" },
      { timestampMs: 30000, progress: 25, kind: "grab" },
      { timestampMs: 60000, progress: 100, kind: "capture" },
    ]);
    expect(returned.markers.map((marker) => [marker.kind, marker.progress])).toEqual([
      ["steal", 0],
      ["drop", -86],
      ["return", -86],
    ]);
  });

  it("draws a reset to the home line when the flag goes home but not when the match ends", () => {
    const timeline = aFakeCtfTimelineWith({
      runs: [
        { ...Preconditions.checkExists(aFakeCtfTimelineWith().runs[0]), outcome: "autoReturn" },
        {
          flagTeamId: 1,
          carrierTeamId: 0,
          startMs: 100000,
          endMs: 120000,
          outcome: "matchEnd",
          samples: [{ timestampMs: 110000, progress: 0.3 }],
          events: [{ timestampMs: 100000, kind: "steal" }],
        },
      ],
    });
    const [autoReturned, cutOff] = buildFlagRuns(timeline, TEAM_IDS, COLORS, DURATION_MS);
    expect(autoReturned.reset).toEqual({ timestampMs: 60000, fromProgress: 60 });
    expect(cutOff.reset).toBeNull();
    expect(cutOff.points.at(-1)).toEqual({ timestampMs: 120000, progress: -30 });
  });

  it("clamps a run that outlives the match to the match end without a capture or reset", () => {
    const timeline = aFakeCtfTimelineWith({
      runs: [
        {
          flagTeamId: 0,
          carrierTeamId: 1,
          startMs: 100000,
          endMs: 130000,
          outcome: "capture",
          samples: [{ timestampMs: 110000, progress: 0.4 }],
          events: [{ timestampMs: 130000, kind: "capture" }],
        },
      ],
    });
    const [run] = buildFlagRuns(timeline, TEAM_IDS, COLORS, DURATION_MS);
    expect(run.points.at(-1)).toEqual({ timestampMs: 120000, progress: 40 });
    expect(run.reset).toBeNull();
    expect(run.markers).toEqual([]);
  });

  it("drops runs that start after the match, belong to unknown teams or have no span", () => {
    const base = Preconditions.checkExists(aFakeCtfTimelineWith().runs[0]);
    const timeline = aFakeCtfTimelineWith({
      runs: [
        { ...base, startMs: 120000, endMs: 130000 },
        { ...base, flagTeamId: 3 },
        { ...base, carrierTeamId: 3 },
        { ...base, startMs: 50000, endMs: 50000 },
      ],
    });
    expect(buildFlagRuns(timeline, TEAM_IDS, COLORS, DURATION_MS)).toEqual([]);
  });

  it("orders samples by time and ignores events stamped before the pull", () => {
    const base = Preconditions.checkExists(aFakeCtfTimelineWith().runs[0]);
    const timeline = aFakeCtfTimelineWith({
      runs: [
        {
          ...base,
          samples: [
            { timestampMs: 45000, progress: 0.6 },
            { timestampMs: 30000, progress: 0.25 },
          ],
          events: [{ timestampMs: 19500, kind: "steal" }, ...base.events.slice(1)],
        },
      ],
    });
    const [run] = buildFlagRuns(timeline, TEAM_IDS, COLORS, DURATION_MS);
    expect(run.points.map((point) => point.timestampMs)).toEqual([20000, 30000, 45000, 60000]);
    expect(run.markers.map((marker) => marker.kind)).toEqual(["grab", "capture"]);
  });

  it("interpolates a marker that falls between two samples onto the drawn line", () => {
    const base = Preconditions.checkExists(aFakeCtfTimelineWith().runs[0]);
    const timeline = aFakeCtfTimelineWith({
      runs: [{ ...base, events: [{ timestampMs: 52500, kind: "grab" }] }],
    });
    const [run] = buildFlagRuns(timeline, TEAM_IDS, COLORS, DURATION_MS);
    expect(run.markers).toEqual([{ timestampMs: 52500, progress: 80, kind: "grab" }]);
  });

  it("returns nothing for a match that is not two teams", () => {
    expect(buildFlagRuns(aFakeCtfTimelineWith(), [0], COLORS, DURATION_MS)).toEqual([]);
  });
});

describe("buildFlagRunLegend", () => {
  it("describes each half of the chart by whose flag it is and who carries it", () => {
    expect(buildFlagRunLegend(TEAM_IDS, COLORS)).toEqual([
      { key: "flag-0", color: "#ff0000", text: "Above: Eagle's flag, carried by Cobra" },
      { key: "flag-1", color: "#0000ff", text: "Below: Cobra's flag, carried by Eagle" },
    ]);
  });

  it("returns nothing without two teams", () => {
    expect(buildFlagRunLegend([0], COLORS)).toEqual([]);
  });
});

describe("progressAt", () => {
  const points = [
    { timestampMs: 0, progress: 0 },
    { timestampMs: 100, progress: 50 },
    { timestampMs: 100, progress: 60 },
    { timestampMs: 200, progress: 100 },
  ];

  it("interpolates between points and takes the later value at a repeated timestamp", () => {
    expect(progressAt(points, 50)).toBe(25);
    expect(progressAt(points, 100)).toBe(50);
    expect(progressAt(points, 150)).toBe(80);
    expect(progressAt(points, 200)).toBe(100);
  });

  it("returns null outside the run's span", () => {
    expect(progressAt(points, -1)).toBeNull();
    expect(progressAt(points, 201)).toBeNull();
    expect(progressAt([], 0)).toBeNull();
  });
});

describe("buildFlagRunsChartPoints", () => {
  it("unions the timestamps of every run and leaves a run null outside its span", () => {
    const runs = buildFlagRuns(aFakeCtfTimelineWith(), TEAM_IDS, COLORS, DURATION_MS);
    const points = buildFlagRunsChartPoints(runs);
    expect(points.map((point) => point.timestampMs)).toEqual([20000, 30000, 45000, 60000, 70000, 80000, 90000, 100000]);
    expect(points[0]).toEqual({ timestampMs: 20000, run1: 0, run2: null });
    expect(points[3]).toEqual({ timestampMs: 60000, run1: 100, run2: null });
    expect(points[5]).toEqual({ timestampMs: 80000, run1: null, run2: -50 });
  });
});
