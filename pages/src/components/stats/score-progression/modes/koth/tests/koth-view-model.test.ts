import { describe, expect, it } from "vitest";
import { buildKothHills } from "../koth-view-model";
import { aFakeKothTimelineWith } from "../fakes/koth-timeline.fake";

const TEAM_IDS = [0, 1] as const;
const TEAM_COLOR_BY_TEAM_ID = new Map<number, string>([
  [0, "#0000ff"],
  [1, "#ff0000"],
]);
const DURATION_MS = 60000;

function buildHills(timeline = aFakeKothTimelineWith(), durationMs = DURATION_MS): ReturnType<typeof buildKothHills> {
  return buildKothHills(timeline, TEAM_IDS, TEAM_COLOR_BY_TEAM_ID, durationMs);
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
    // hill 1 winner reads 100%; hill 2 has one Cobra tick of the 8-tick meter (13%)
    expect(hills[0]?.teamCaptureProgress.map((p) => p.percentage)).toEqual([100, 0]);
    expect(hills[1]?.teamCaptureProgress.map((p) => p.percentage)).toEqual([0, 13]);
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
    // Team 0 captures hill 1 at 30000 → 100%; Team 1 had 1 of 8 meter ticks inside it → 13%
    expect(hill1.teamCaptureProgress.map((p) => p.percentage)).toEqual([100, 13]);
    // Team 1 captures hill 2 → 100%; Team 0 never scored inside it → 0%
    expect(hill2.teamCaptureProgress.map((p) => p.percentage)).toEqual([0, 100]);
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
});
