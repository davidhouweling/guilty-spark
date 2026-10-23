import { describe, expect, it } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aFakeCtfTimelineWith } from "../fakes/ctf-timeline.fake";
import { buildFlagRunLegend, buildFlagRuns, buildFlagRunsChartPoints } from "../ctf-view-model";

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

  it("keeps a capture stamped just past the match duration by clamping it onto the axis", () => {
    const timeline = aFakeCtfTimelineWith({
      runs: [
        {
          flagTeamId: 0,
          carrierTeamId: 1,
          startMs: 100000,
          endMs: 120040,
          outcome: "capture",
          samples: [{ timestampMs: 110000, progress: 0.4 }],
          events: [{ timestampMs: 120040, kind: "capture" }],
        },
      ],
    });
    const [run] = buildFlagRuns(timeline, TEAM_IDS, COLORS, DURATION_MS);
    expect(run.points.at(-1)).toEqual({ timestampMs: 120000, progress: 100 });
    expect(run.markers).toEqual([{ timestampMs: 120000, progress: 100, kind: "capture" }]);
    expect(run.reset).toEqual({ timestampMs: 120000, fromProgress: 100 });
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

  it("orders samples by time and clamps an event stamped just before the pull onto its start", () => {
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
    expect(run.markers.map((marker) => [marker.kind, marker.timestampMs])).toEqual([
      ["steal", 20000],
      ["grab", 30000],
      ["capture", 60000],
    ]);
  });

  it("interpolates a marker that falls between two samples onto the drawn line", () => {
    const base = Preconditions.checkExists(aFakeCtfTimelineWith().runs[0]);
    const timeline = aFakeCtfTimelineWith({
      runs: [{ ...base, events: [{ timestampMs: 52500, kind: "grab" }] }],
    });
    const [run] = buildFlagRuns(timeline, TEAM_IDS, COLORS, DURATION_MS);
    expect(run.markers).toEqual([{ timestampMs: 52500, progress: 80, kind: "grab" }]);
  });

  it("uses a sample stamped at the run end and keeps the last of duplicate timestamps", () => {
    const base = Preconditions.checkExists(aFakeCtfTimelineWith().runs[1]);
    const timeline = aFakeCtfTimelineWith({
      runs: [
        {
          ...base,
          samples: [
            { timestampMs: 80000, progress: 0.4 },
            { timestampMs: 80000, progress: 0.5 },
            { timestampMs: 100000, progress: 0.9 },
          ],
        },
      ],
    });
    const [run] = buildFlagRuns(timeline, TEAM_IDS, COLORS, DURATION_MS);
    expect(run.points).toEqual([
      { timestampMs: 70000, progress: 0 },
      { timestampMs: 80000, progress: -50 },
      { timestampMs: 100000, progress: -90 },
    ]);
    expect(run.reset).toEqual({ timestampMs: 100000, fromProgress: -90 });
  });

  it("drops a run whose carrier is the flag's own team", () => {
    const base = Preconditions.checkExists(aFakeCtfTimelineWith().runs[0]);
    const timeline = aFakeCtfTimelineWith({ runs: [{ ...base, carrierTeamId: base.flagTeamId }] });
    expect(buildFlagRuns(timeline, TEAM_IDS, COLORS, DURATION_MS)).toEqual([]);
  });

  it("drops an event stamped well outside its run instead of clamping it", () => {
    const base = Preconditions.checkExists(aFakeCtfTimelineWith().runs[0]);
    const timeline = aFakeCtfTimelineWith({
      runs: [
        {
          ...base,
          events: [
            { timestampMs: 95000, kind: "grab" },
            { timestampMs: 60500, kind: "capture" },
          ],
        },
      ],
    });
    const [run] = buildFlagRuns(timeline, TEAM_IDS, COLORS, DURATION_MS);
    expect(run.markers).toEqual([{ timestampMs: 60000, progress: 100, kind: "capture" }]);
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

describe("buildFlagRunsChartPoints", () => {
  it("unions the timestamps of every run and leaves a run null outside its span", () => {
    const runs = buildFlagRuns(aFakeCtfTimelineWith(), TEAM_IDS, COLORS, DURATION_MS);
    const points = buildFlagRunsChartPoints(runs);
    expect(points.map((point) => point.timestampMs)).toEqual([20000, 30000, 45000, 60000, 70000, 80000, 90000, 100000]);
    expect(points[0]).toEqual({ timestampMs: 20000, run1: 0, run2: null });
    expect(points[3]).toEqual({ timestampMs: 60000, run1: 100, run2: null });
    expect(points[5]).toEqual({ timestampMs: 80000, run1: null, run2: -50 });
  });

  it("interpolates a run at the other run's sample times while both flags are out", () => {
    const [first, second] = aFakeCtfTimelineWith().runs;
    const timeline = aFakeCtfTimelineWith({
      runs: [
        Preconditions.checkExists(first),
        { ...Preconditions.checkExists(second), startMs: 40000, endMs: 50000, samples: [], events: [] },
      ],
    });
    const points = buildFlagRunsChartPoints(buildFlagRuns(timeline, TEAM_IDS, COLORS, DURATION_MS));
    expect(points.find((point) => point.timestampMs === 40000)).toEqual({
      timestampMs: 40000,
      run1: 25 + ((40000 - 30000) / 15000) * 35,
      run2: 0,
    });
    expect(points.find((point) => point.timestampMs === 50000)).toEqual({
      timestampMs: 50000,
      run1: 60 + ((50000 - 45000) / 15000) * 40,
      run2: 0,
    });
  });
});
