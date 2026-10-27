import { describe, expect, it } from "vitest";
import { buildKothHillWindows, buildKothHills, buildKothScoreSeries } from "../koth-view-model";
import { aFakeKothTimelineWith } from "../fakes/koth-timeline.fake";

const TEAM_IDS = [0, 1] as const;
const TEAM_COLOR_BY_TEAM_ID = new Map<number, string>([
  [0, "#0000ff"],
  [1, "#ff0000"],
]);
const DURATION_MS = 60000;

function buildHills(timeline = aFakeKothTimelineWith(), durationMs = DURATION_MS): ReturnType<typeof buildKothHills> {
  return buildKothHills(
    timeline,
    buildKothHillWindows(timeline, TEAM_IDS, durationMs),
    TEAM_IDS,
    TEAM_COLOR_BY_TEAM_ID,
  );
}

function buildSeries(
  timeline = aFakeKothTimelineWith(),
  durationMs = DURATION_MS,
): ReturnType<typeof buildKothScoreSeries> {
  return buildKothScoreSeries(buildKothHillWindows(timeline, TEAM_IDS, durationMs), TEAM_IDS, durationMs);
}

describe("buildKothHills", () => {
  it("returns one hill per capture plus a trailing uncaptured hill", () => {
    // the fake has 2 capture timestamps and durationMs=60000 > last capture (55000)
    expect(buildHills()).toHaveLength(3);
  });

  it("assigns 1-based hillIndex to each hill including the trailing one", () => {
    const hills = buildHills();
    expect(hills[0]?.hillIndex).toBe(1);
    expect(hills[1]?.hillIndex).toBe(2);
    expect(hills[2]?.hillIndex).toBe(3);
  });

  it("sets hill startMs from match start and endMs from the capture timestamp", () => {
    const hills = buildHills();
    expect(hills[0]?.startMs).toBe(0);
    expect(hills[0]?.endMs).toBe(30000);
  });

  it("identifies the winner as the team whose score event matches the capture timestamp", () => {
    const hills = buildHills();
    expect(hills[0]?.winnerTeamId).toBe(0);
    expect(hills[1]?.winnerTeamId).toBe(1);
  });

  it("awards the hill to the team whose score event is the capture timestamp even when they are a minority in the control period", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
        { timestampMs: 15000, teamId: 0, runningScores: { "0": 2, "1": 0 } },
        { timestampMs: 30000, teamId: 1, runningScores: { "0": 2, "1": 1 } },
      ],
      controlPeriods: [{ startMs: 0, endMs: 30000, controllingTeamId: 0 }],
      hillCaptureTimestamps: [30000],
    });
    const hills = buildHills(timeline);
    // Team 1 (Cobra) has the score event at the capture timestamp (t=30000),
    // even though Team 0 (Eagle) majority-controlled the period — Cobra should win.
    expect(hills[0]?.winnerTeamId).toBe(1);
  });

  it("sets winnerColor from the winning team's color", () => {
    const hills = buildHills();
    expect(hills[0]?.winnerColor).toBe("#0000ff");
    expect(hills[1]?.winnerColor).toBe("#ff0000");
  });

  it("sets winnerName from the winning team using getTeamName", () => {
    const hills = buildHills();
    expect(hills[0]?.winnerName).toBe("Eagle");
    expect(hills[1]?.winnerName).toBe("Cobra");
  });

  it("produces team occupancy percentages for each hill", () => {
    const [hill1] = buildHills();
    expect(hill1.teamCaptureProgress).toHaveLength(2);
    expect(hill1.teamCaptureProgress.every((o) => o.percentage >= 0 && o.percentage <= 100)).toBe(true);
  });

  it("sets 0% occupancy for a team that never held the hill", () => {
    const [, hill2] = buildHills();
    const eagleOccupancy = hill2.teamCaptureProgress.find((o) => o.teamId === 0);
    expect(eagleOccupancy?.percentage).toBe(0);
  });

  it("produces segments covering the full hill period with no gaps", () => {
    const [hill1] = buildHills();
    const covered = hill1.segments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);
    expect(covered).toBe(hill1.endMs - hill1.startMs);
  });

  it("assigns team colors to occupied segments and null to unoccupied segments", () => {
    const [hill1] = buildHills();
    const occupied = hill1.segments.filter((s) => s.teamId != null);
    const unoccupied = hill1.segments.filter((s) => s.teamId === null);
    expect(occupied.every((s) => s.color != null)).toBe(true);
    expect(unoccupied.every((s) => s.color === null)).toBe(true);
  });

  it("includes a trailing uncaptured hill when hillCaptureTimestamps does not reach durationMs", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
        { timestampMs: 45000, teamId: 1, runningScores: { "0": 1, "1": 1 } },
      ],
      controlPeriods: [{ startMs: 0, endMs: 30000, controllingTeamId: 0 }],
      hillCaptureTimestamps: [30000],
    });
    const hills = buildHills(timeline);
    expect(hills).toHaveLength(2);
    expect(hills[1]?.endMs).toBe(60000);
    expect(hills[1]?.winnerTeamId).toBeNull();
  });

  it("does not add a trailing hill when the last capture timestamp equals durationMs", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
        { timestampMs: 60000, teamId: 1, runningScores: { "0": 1, "1": 1 } },
      ],
      hillCaptureTimestamps: [30000, 60000],
    });
    const hills = buildHills(timeline);
    expect(hills).toHaveLength(2);
    expect(hills[1]?.endMs).toBe(60000);
    expect(hills[1]?.winnerTeamId).toBe(1);
  });

  it("discards a sub-2-second trailing sliver when the match ends on the final capture", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
        { timestampMs: 59100, teamId: 1, runningScores: { "0": 1, "1": 1 } },
      ],
      hillCaptureTimestamps: [30000, 59100],
    });
    const hills = buildHills(timeline);
    expect(hills).toHaveLength(2);
    expect(hills[1]?.endMs).toBe(59100);
    expect(hills[1]?.winnerTeamId).toBe(1);
  });

  it("computes capture progress from score ticks even when controlPeriods is empty", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
        { timestampMs: 30000, teamId: 0, runningScores: { "0": 2, "1": 0 } },
        { timestampMs: 45000, teamId: 1, runningScores: { "0": 2, "1": 1 } },
      ],
      controlPeriods: [],
      hillCaptureTimestamps: [30000],
    });
    const hills = buildHills(timeline);
    expect(hills).toHaveLength(2);
    expect(hills[0]?.winnerTeamId).toBe(0);
    // hill 1 was captured with 2 recorded ticks, so one Cobra tick in the uncaptured hill 2 is half a meter
    expect(hills[0]?.teamCaptureProgress.map((p) => p.percentage)).toEqual([100, 0]);
    expect(hills[1]?.teamCaptureProgress.map((p) => p.percentage)).toEqual([0, 50]);
  });

  it("renders a control window straddling a capture boundary as unoccupied in the next hill", () => {
    // Team 1 captures hill 1 at 30000 inside a control window running to 40000; team 1 never
    // scores in hill 2, so the window's spillover into hill 2 must not paint team 1's colour.
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 25000, teamId: 1, runningScores: { "0": 0, "1": 1 } },
        { timestampMs: 30000, teamId: 1, runningScores: { "0": 0, "1": 2 } },
        { timestampMs: 50000, teamId: 0, runningScores: { "0": 1, "1": 2 } },
        { timestampMs: 55000, teamId: 0, runningScores: { "0": 2, "1": 2 } },
      ],
      controlPeriods: [
        { startMs: 0, endMs: 40000, controllingTeamId: 1 },
        { startMs: 45000, endMs: 60000, controllingTeamId: 0 },
      ],
      hillCaptureTimestamps: [30000],
    });
    const hills = buildHills(timeline, 90000);
    const hill2Segments = hills[1]?.segments ?? [];
    // the nulled spillover (30000-40000) merges with the adjacent gap into one unoccupied run
    const spillover = hill2Segments.find((s) => s.startMs === 30000 && s.endMs === 45000);
    expect(spillover?.teamId).toBeNull();
    const corroborated = hill2Segments.find((s) => s.startMs === 45000 && s.endMs === 60000);
    expect(corroborated?.teamId).toBe(0);
  });

  it("pins the winner's capture progress at 100% and estimates the loser from their ticks", () => {
    const [hill1, hill2] = buildHills();
    // Team 0 captures hill 1 at 30000 with 4 recorded ticks → 100%; Team 1's 1 tick is a quarter of that meter
    expect(hill1.teamCaptureProgress.map((p) => p.percentage)).toEqual([100, 25]);
    // Team 1 captures hill 2 → 100%; Team 0 never scored inside it → 0%
    expect(hill2.teamCaptureProgress.map((p) => p.percentage)).toEqual([0, 100]);
  });

  it("caps a loser's meter just below a capture even when they out-ticked the winner", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 5000, teamId: 1, runningScores: { "0": 0, "1": 3 } },
        { timestampMs: 10000, teamId: 0, runningScores: { "0": 2, "1": 3 } },
      ],
      hillCaptureTimestamps: [10000],
    });
    expect(buildHills(timeline)[0]?.teamCaptureProgress.map((p) => p.percentage)).toEqual([100, 99]);
  });

  it("counts a score event at the match start toward the first hill, as the score lines do", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 0, teamId: 0, runningScores: { "0": 1, "1": 0 } },
        { timestampMs: 5000, teamId: 1, runningScores: { "0": 1, "1": 1 } },
        { timestampMs: 10000, teamId: 0, runningScores: { "0": 4, "1": 1 } },
      ],
      hillCaptureTimestamps: [10000],
    });
    expect(buildHills(timeline)[0]?.teamCaptureProgress.map((p) => p.percentage)).toEqual([100, 25]);
  });

  it("carries a team's meter forward across a sparse event that omits it", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 5000, teamId: 1, runningScores: { "0": 0, "1": 1 } },
        { timestampMs: 10000, teamId: 0, runningScores: { "0": 4 } },
      ],
      hillCaptureTimestamps: [10000],
    });
    expect(buildHills(timeline)[0]?.teamCaptureProgress.map((p) => p.percentage)).toEqual([100, 25]);
  });

  it("names the team whose event the capture sits on when two teams tick on the capture instant", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 5000, teamId: 0, runningScores: { "0": 2, "1": 0 } },
        { timestampMs: 30000, teamId: 0, runningScores: { "0": 4, "1": 0 } },
        { timestampMs: 30000, teamId: 1, runningScores: { "0": 4, "1": 2 } },
      ],
      hillCaptureTimestamps: [30000],
    });
    const [hill] = buildHills(timeline);
    expect(hill.winnerTeamId).toBe(1);
    expect(hill.teamCaptureProgress.map((p) => p.percentage)).toEqual([99, 100]);
  });

  it("reads an uncaptured hill against the nominal meter when nothing was captured, capped below a capture", () => {
    const [hill] = buildHills(aFakeKothTimelineWith({ hillCaptureTimestamps: [] }));
    expect(hill.teamCaptureProgress.map((p) => p.percentage)).toEqual([50, 50]);

    const overshoot = aFakeKothTimelineWith({
      events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 9, "1": 0 } }],
      hillCaptureTimestamps: [],
    });
    expect(buildHills(overshoot)[0]?.teamCaptureProgress.map((p) => p.percentage)).toEqual([99, 0]);
  });

  it("reads a trailing uncaptured hill against the match's typical capture tick count", () => {
    const timeline = aFakeKothTimelineWith({
      events: [...aFakeKothTimelineWith().events, { timestampMs: 57000, teamId: 0, runningScores: { "0": 5, "1": 4 } }],
    });
    // captures took 4 and 3 recorded ticks, so one tick in the trailing hill is 1 / 3.5 of a meter
    expect(buildHills(timeline)[2]?.teamCaptureProgress.map((p) => p.percentage)).toEqual([29, 0]);
  });

  it("pins a winner the film kept no ticks for at 100% without counting it as a capture meter", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 5000, teamId: 1, runningScores: { "0": 0, "1": 2 } },
        { timestampMs: 10000, teamId: 0, runningScores: { "1": 2 } },
        { timestampMs: 20000, teamId: 1, runningScores: { "0": 0, "1": 4 } },
      ],
      hillCaptureTimestamps: [10000],
    });
    const [captured, trailing] = buildHills(timeline, 60000);
    expect(captured.teamCaptureProgress.map((p) => p.percentage)).toEqual([100, 25]);
    // the trailing hill reads against the nominal meter: no real capture tick count was observed
    expect(trailing.teamCaptureProgress.map((p) => p.percentage)).toEqual([0, 25]);
  });

  it("reads an early tickless capture against captures recorded later in the match", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 5000, teamId: 1, runningScores: { "0": 0, "1": 2 } },
        { timestampMs: 10000, teamId: 0, runningScores: { "1": 2 } },
        { timestampMs: 20000, teamId: 1, runningScores: { "0": 0, "1": 6 } },
      ],
      hillCaptureTimestamps: [10000, 20000],
    });
    const [tickless] = buildHills(timeline, 60000);
    // hill 2 was captured with 4 recorded ticks, so hill 1's 2 Cobra ticks are half a meter
    expect(tickless.teamCaptureProgress.map((p) => p.percentage)).toEqual([100, 50]);
  });

  it("returns a single uncaptured hill when hillCaptureTimestamps is empty", () => {
    const timeline = aFakeKothTimelineWith({
      events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
      controlPeriods: [],
      hillCaptureTimestamps: [],
    });
    const hills = buildHills(timeline);
    expect(hills).toHaveLength(1);
    expect(hills[0]?.startMs).toBe(0);
    expect(hills[0]?.endMs).toBe(60000);
    expect(hills[0]?.winnerTeamId).toBeNull();
  });

  it("clamps a capture past the match duration to the axis while the raw timestamp still names the winner", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 30000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
        { timestampMs: 60350, teamId: 1, runningScores: { "0": 1, "1": 1 } },
      ],
      controlPeriods: [
        { startMs: 0, endMs: 30000, controllingTeamId: 0 },
        { startMs: 30000, endMs: 60000, controllingTeamId: 1 },
      ],
      hillCaptureTimestamps: [30000, 60350],
    });
    const hills = buildHills(timeline);
    // the clamped final hill leaves no room for a trailing uncaptured hill
    expect(hills).toHaveLength(2);
    expect(hills[1]?.endMs).toBe(60000);
    expect(hills[1]?.winnerTeamId).toBe(1);
  });
});

describe("buildKothScoreSeries", () => {
  it("builds per-hill meter curves that fill at each capture and reset for the next hill", () => {
    const { samples, hillBoundaries } = buildSeries();

    expect(hillBoundaries).toEqual([30000, 55000]);
    const share = (ticks: number): number => (ticks / 3) * 100;
    expect(samples).toEqual([
      // hill 1: team 0 captures with 4 recorded ticks, so each of its ticks is a quarter of the meter
      { timestampMs: 0, runningScores: { "0": 0, "1": 0 } },
      { timestampMs: 2500, runningScores: { "0": 25, "1": 0 } },
      { timestampMs: 5000, runningScores: { "0": 50, "1": 0 } },
      { timestampMs: 12500, runningScores: { "0": 50, "1": 25 } },
      { timestampMs: 20000, runningScores: { "0": 75, "1": 25 } },
      { timestampMs: 30000, runningScores: { "0": 100, "1": 25 } },
      // hill 2: team 1 captures with 3 ticks measured against the totals standing at the capture
      { timestampMs: 30000, runningScores: { "0": 0, "1": 0 } },
      { timestampMs: 32500, runningScores: { "0": 0, "1": share(1) } },
      { timestampMs: 45000, runningScores: { "0": 0, "1": share(2) } },
      { timestampMs: 55000, runningScores: { "0": 0, "1": 100 } },
      // trailing hill: contested but never captured
      { timestampMs: 55000, runningScores: { "0": 0, "1": 0 } },
    ]);
  });

  it("builds one cumulative window with no boundaries when no captures are identified", () => {
    const timeline = aFakeKothTimelineWith({ hillCaptureTimestamps: [] });
    const { samples, hillBoundaries } = buildSeries(timeline);

    expect(hillBoundaries).toEqual([]);
    expect(samples[0]).toEqual({ timestampMs: 0, runningScores: { "0": 0, "1": 0 } });
    expect(samples.at(-1)).toEqual({ timestampMs: 55000, runningScores: { "0": 50, "1": 50 } });
  });

  it("omits the trailing window and boundary for a sub-2-second post-capture sliver, matching the hills", () => {
    const timeline = aFakeKothTimelineWith({ hillCaptureTimestamps: [30000, 59100] });
    const { samples, hillBoundaries } = buildSeries(timeline);

    expect(hillBoundaries).toEqual([30000]);
    // no event sits on the 59100 capture, so hill 2 has no winner and reads against hill 1's 4-tick capture
    expect(samples.at(-1)).toEqual({ timestampMs: 55000, runningScores: { "0": 0, "1": 75 } });
  });

  it("counts a score event at the match start toward the first hill instead of the baseline", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 0, teamId: 0, runningScores: { "0": 1, "1": 0 } },
        { timestampMs: 5000, teamId: 0, runningScores: { "0": 2, "1": 0 } },
      ],
      hillCaptureTimestamps: [],
    });
    const { samples } = buildSeries(timeline);

    expect(samples).toEqual([
      { timestampMs: 0, runningScores: { "0": 0, "1": 0 } },
      { timestampMs: 0, runningScores: { "0": 12.5, "1": 0 } },
      { timestampMs: 5000, runningScores: { "0": 25, "1": 0 } },
    ]);
  });

  it("carries a team's score forward across a sparse event that omits it", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 5000, teamId: 0, runningScores: { "0": 2, "1": 1 } },
        { timestampMs: 30000, teamId: 1, runningScores: { "1": 3 } },
      ],
      hillCaptureTimestamps: [30000],
    });
    const { samples } = buildSeries(timeline);

    const share = (ticks: number): number => (ticks / 3) * 100;
    expect(samples).toEqual([
      { timestampMs: 0, runningScores: { "0": 0, "1": 0 } },
      { timestampMs: 5000, runningScores: { "0": share(2), "1": share(1) } },
      { timestampMs: 30000, runningScores: { "0": share(2), "1": 100 } },
      { timestampMs: 30000, runningScores: { "0": 0, "1": 0 } },
    ]);
  });

  it("reads a captured hill against the winner's ticks at the capture, so overshoot still ends at a full meter", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 5000, teamId: 0, runningScores: { "0": 8, "1": 0 } },
        { timestampMs: 10000, teamId: 0, runningScores: { "0": 10, "1": 0 } },
      ],
      hillCaptureTimestamps: [10000],
    });
    const { samples } = buildSeries(timeline);

    expect(samples.map((sample) => sample.runningScores["0"])).toEqual([0, 80, 100, 0]);
  });

  it("returns an empty series when every event lands past the match duration", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 61000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
        { timestampMs: 66000, teamId: 1, runningScores: { "0": 1, "1": 1 } },
      ],
      hillCaptureTimestamps: [],
    });
    expect(buildSeries(timeline)).toEqual({ samples: [], hillBoundaries: [] });
  });

  it("clamps ticks from a match-ending capture past the duration onto the axis edge", () => {
    const timeline = aFakeKothTimelineWith({
      events: [
        { timestampMs: 30000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
        { timestampMs: 58000, teamId: 1, runningScores: { "0": 1, "1": 1 } },
        { timestampMs: 60350, teamId: 1, runningScores: { "0": 1, "1": 2 } },
      ],
      hillCaptureTimestamps: [30000, 60350],
    });
    const { samples, hillBoundaries } = buildSeries(timeline);

    expect(hillBoundaries).toEqual([30000]);
    expect(samples.at(-1)).toEqual({ timestampMs: 60000, runningScores: { "0": 0, "1": 100 } });
  });
});

describe("buildKothHillWindows", () => {
  it("attributes each hill's events, ticks and meter once for both views", () => {
    const windows = buildKothHillWindows(aFakeKothTimelineWith(), TEAM_IDS, DURATION_MS);

    expect(windows.map((hillWindow) => [hillWindow.startMs, hillWindow.endMs, hillWindow.captureTs])).toEqual([
      [0, 30000, 30000],
      [30000, 55000, 55000],
      [55000, 60000, null],
    ]);
    expect(windows.map((hillWindow) => hillWindow.events.length)).toEqual([5, 3, 0]);
    expect(windows[1]?.events.map((event) => [event.timestampMs, event.teamId, event.ticksByTeam])).toEqual([
      [32500, 1, { "0": 0, "1": 1 }],
      [45000, 1, { "0": 0, "1": 2 }],
      [55000, 1, { "0": 0, "1": 3 }],
    ]);
    expect(windows.map((hillWindow) => hillWindow.hillTicks)).toEqual([
      { "0": 4, "1": 1 },
      { "0": 0, "1": 3 },
      { "0": 0, "1": 0 },
    ]);
    expect(windows.map((hillWindow) => hillWindow.meter)).toEqual([
      { winnerTeamId: 0, ticksPerFullMeter: 4 },
      { winnerTeamId: 1, ticksPerFullMeter: 3 },
      { winnerTeamId: null, ticksPerFullMeter: 3.5 },
    ]);
  });
});
