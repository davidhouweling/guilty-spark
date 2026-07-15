import { describe, expect, it } from "vitest";
import { formatScoreProgression } from "../score-progression-formatter";
import { aFakeScoreProgressionWith } from "../fakes/aFakeScoreProgressionWith";

const TEAM_COLORS = [
  { id: "eagle", hex: "#0000ff", name: "Eagle" },
  { id: "cobra", hex: "#ff0000", name: "Cobra" },
] as const;

describe("formatScoreProgression", () => {
  it("returns null when scoreProgression is null", () => {
    expect(formatScoreProgression(null, TEAM_COLORS)).toBeNull();
  });

  it("returns null when timeline has no events", () => {
    const data = aFakeScoreProgressionWith({ timeline: { type: "kill-race", events: [] } });
    expect(formatScoreProgression(data, TEAM_COLORS)).toBeNull();
  });

  it("returns one team line per team derived from the first event runningScores", () => {
    const result = formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS);
    expect(result?.teamLines).toHaveLength(2);
    expect(result?.teamLines[0]?.teamId).toBe(0);
    expect(result?.teamLines[1]?.teamId).toBe(1);
  });

  it("assigns team colors by slot index order", () => {
    const result = formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS);
    expect(result?.teamLines[0]?.color).toBe("#0000ff");
    expect(result?.teamLines[1]?.color).toBe("#ff0000");
  });

  it("assigns team names from teamColors by slot index order", () => {
    const result = formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS);
    expect(result?.teamLines[0]?.name).toBe("Eagle");
    expect(result?.teamLines[1]?.name).toBe("Cobra");
  });

  it("uses fallback name when teamColors has no entry for that slot", () => {
    const result = formatScoreProgression(aFakeScoreProgressionWith(), []);
    expect(result?.teamLines[0]?.name).toBe("Team 1");
    expect(result?.teamLines[1]?.name).toBe("Team 2");
  });

  it("uses fallback colors when teamColors has no entries", () => {
    const result = formatScoreProgression(aFakeScoreProgressionWith(), []);
    expect(result?.teamLines[0]?.color).toBe("#888888");
    expect(result?.teamLines[1]?.color).toBe("#aaaaaa");
  });

  it("starts each team line at (0, 0)", () => {
    const result = formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS);
    expect(result?.teamLines[0]?.points[0]).toEqual({ timestampMs: 0, score: 0 });
    expect(result?.teamLines[1]?.points[0]).toEqual({ timestampMs: 0, score: 0 });
  });

  it("produces step-function points for each kill event with sync points for other teams", () => {
    const result = formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS);
    const team0Points = result?.teamLines[0]?.points ?? [];
    // team 0 kills at t=5000 and t=20000; sync point added at t=12000 (team 1 kill)
    expect(team0Points).toEqual([
      { timestampMs: 0, score: 0 },
      { timestampMs: 5000, score: 0 },
      { timestampMs: 5000, score: 1 },
      { timestampMs: 12000, score: 1 },
      { timestampMs: 20000, score: 1 },
      { timestampMs: 20000, score: 2 },
      { timestampMs: 600000, score: 2 },
    ]);
  });

  it("extends each team line to the full match durationMs", () => {
    const result = formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS);
    const lastTeam0 = result?.teamLines[0]?.points.at(-1);
    const lastTeam1 = result?.teamLines[1]?.points.at(-1);
    expect(lastTeam0?.timestampMs).toBe(600000);
    expect(lastTeam1?.timestampMs).toBe(600000);
  });

  it("adds a sync point for a team with no kills at each opponent kill timestamp", () => {
    const data = aFakeScoreProgressionWith({
      timeline: {
        type: "kill-race",
        events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
      },
    });
    const result = formatScoreProgression(data, TEAM_COLORS);
    const team1Points = result?.teamLines[1]?.points ?? [];
    expect(team1Points).toEqual([
      { timestampMs: 0, score: 0 },
      { timestampMs: 5000, score: 0 },
      { timestampMs: 600000, score: 0 },
    ]);
  });

  it("passes through durationMs from the source data", () => {
    const result = formatScoreProgression(aFakeScoreProgressionWith({ durationMs: 480000 }), TEAM_COLORS);
    expect(result?.durationMs).toBe(480000);
  });
});
