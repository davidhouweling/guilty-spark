import { describe, expect, it } from "vitest";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aFakeCtfTimelineWith } from "../fakes/ctf-timeline.fake";
import { buildFlagRunLegend, buildFlagRuns } from "../ctf-view-model";

const TEAM_IDS = [0, 1] as const;
const COLORS = new Map([
  [0, "#0000ff"],
  [1, "#ff0000"],
]);
const DURATION_MS = 120000;

describe("buildFlagRuns", () => {
  it("builds one run per flag pull, coloured by the carrying team", () => {
    const runs = buildFlagRuns(aFakeCtfTimelineWith(), TEAM_IDS, COLORS, DURATION_MS);
    expect(runs.map((run) => [run.runIndex, run.seriesName, run.color, run.outcome])).toEqual([
      [1, "Eagle flag · Cobra carrying", "#ff0000", "capture"],
      [2, "Cobra flag · Eagle carrying", "#0000ff", "return"],
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
