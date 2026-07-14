import { describe, expect, it } from "vitest";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { formatScoreProgression } from "../score-progression-formatter";

const TEAM_COLORS = [
  { id: "eagle", hex: "#0000ff", name: "Eagle" },
  { id: "cobra", hex: "#ff0000", name: "Cobra" },
] as const;

function aFakeScoreProgression(
  overrides: Partial<NonNullable<MatchAnalytics["scoreProgression"]>> = {},
): NonNullable<MatchAnalytics["scoreProgression"]> {
  return {
    mode: 9,
    durationMs: 600000,
    teamCount: 2,
    timeline: {
      type: "kill-race",
      events: [
        { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
        { timestampMs: 12000, teamId: 1, runningScores: { "0": 1, "1": 1 } },
        { timestampMs: 20000, teamId: 0, runningScores: { "0": 2, "1": 1 } },
      ],
    },
    ...overrides,
  };
}

describe("formatScoreProgression", () => {
  it("returns null when scoreProgression is null", () => {
    expect(formatScoreProgression(null, TEAM_COLORS)).toBeNull();
  });

  it("returns null when timeline has no events", () => {
    const data = aFakeScoreProgression({ timeline: { type: "kill-race", events: [] } });
    expect(formatScoreProgression(data, TEAM_COLORS)).toBeNull();
  });

  it("returns one team line per team derived from the first event runningScores", () => {
    const result = formatScoreProgression(aFakeScoreProgression(), TEAM_COLORS);
    expect(result?.teamLines).toHaveLength(2);
    expect(result?.teamLines[0]?.teamId).toBe(0);
    expect(result?.teamLines[1]?.teamId).toBe(1);
  });

  it("assigns team colors by teamId index", () => {
    const result = formatScoreProgression(aFakeScoreProgression(), TEAM_COLORS);
    expect(result?.teamLines[0]?.color).toBe("#0000ff");
    expect(result?.teamLines[1]?.color).toBe("#ff0000");
  });

  it("uses fallback color when teamColors has no entry for teamId", () => {
    const result = formatScoreProgression(aFakeScoreProgression(), []);
    expect(result?.teamLines[0]?.color).toBeDefined();
  });

  it("starts each team line at (0, 0)", () => {
    const result = formatScoreProgression(aFakeScoreProgression(), TEAM_COLORS);
    expect(result?.teamLines[0]?.points[0]).toEqual({ timestampMs: 0, score: 0 });
    expect(result?.teamLines[1]?.points[0]).toEqual({ timestampMs: 0, score: 0 });
  });

  it("produces step-function points for each kill event", () => {
    const result = formatScoreProgression(aFakeScoreProgression(), TEAM_COLORS);
    const team0Points = result?.teamLines[0]?.points ?? [];
    // team 0 kills at t=5000 and t=20000
    // points: (0,0), (5000,0), (5000,1), (20000,1), (20000,2), (600000,2)
    expect(team0Points).toEqual([
      { timestampMs: 0, score: 0 },
      { timestampMs: 5000, score: 0 },
      { timestampMs: 5000, score: 1 },
      { timestampMs: 20000, score: 1 },
      { timestampMs: 20000, score: 2 },
      { timestampMs: 600000, score: 2 },
    ]);
  });

  it("extends each team line to the full match durationMs", () => {
    const result = formatScoreProgression(aFakeScoreProgression(), TEAM_COLORS);
    const lastTeam0 = result?.teamLines[0]?.points.at(-1);
    const lastTeam1 = result?.teamLines[1]?.points.at(-1);
    expect(lastTeam0?.timestampMs).toBe(600000);
    expect(lastTeam1?.timestampMs).toBe(600000);
  });

  it("produces a flat line for a team with no kills", () => {
    const data = aFakeScoreProgression({
      timeline: {
        type: "kill-race",
        events: [
          { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
        ],
      },
    });
    const result = formatScoreProgression(data, TEAM_COLORS);
    const team1Points = result?.teamLines[1]?.points ?? [];
    expect(team1Points).toEqual([
      { timestampMs: 0, score: 0 },
      { timestampMs: 600000, score: 0 },
    ]);
  });

  it("passes through durationMs from the source data", () => {
    const result = formatScoreProgression(aFakeScoreProgression({ durationMs: 480000 }), TEAM_COLORS);
    expect(result?.durationMs).toBe(480000);
  });
});
