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
    const data = aFakeScoreProgressionWith({ timeline: { type: "kill-race", events: [], deathTimeline: [] } });
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

  it("assigns team names from teamId using getTeamName", () => {
    const result = formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS);
    expect(result?.teamLines[0]?.name).toBe("Eagle");
    expect(result?.teamLines[1]?.name).toBe("Cobra");
  });

  it("assigns team names from teamId even when teamColors has no entries", () => {
    const result = formatScoreProgression(aFakeScoreProgressionWith(), []);
    expect(result?.teamLines[0]?.name).toBe("Eagle");
    expect(result?.teamLines[1]?.name).toBe("Cobra");
  });

  it("uses getTeamColorOrDefault fallback colors when teamColors has no entries", () => {
    const result = formatScoreProgression(aFakeScoreProgressionWith(), []);
    expect(result?.teamLines[0]?.color).toBe("#FE3939");
    expect(result?.teamLines[1]?.color).toBe("#3B9DFF");
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
        deathTimeline: [],
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

  describe("scoreDelta", () => {
    it("computes delta points from events with one point per event plus start and terminal", () => {
      const result = formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS);
      expect(result?.scoreDelta?.points).toEqual([
        { timestampMs: 0, score: 0 },
        { timestampMs: 5000, score: 1 },
        { timestampMs: 12000, score: 0 },
        { timestampMs: 20000, score: 1 },
        { timestampMs: 600000, score: 1 },
      ]);
    });

    it("sets minScore and maxScore from the computed delta points", () => {
      const result = formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS);
      expect(result?.scoreDelta?.minScore).toBe(0);
      expect(result?.scoreDelta?.maxScore).toBe(1);
    });

    it("sets minScore and maxScore for mixed positive and negative deltas", () => {
      const data = aFakeScoreProgressionWith({
        timeline: {
          type: "kill-race",
          events: [
            { timestampMs: 5000, teamId: 1, runningScores: { "0": 0, "1": 1 } },
            { timestampMs: 10000, teamId: 0, runningScores: { "0": 1, "1": 1 } },
            { timestampMs: 15000, teamId: 0, runningScores: { "0": 2, "1": 1 } },
          ],
          deathTimeline: [],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.scoreDelta?.minScore).toBe(-1);
      expect(result?.scoreDelta?.maxScore).toBe(1);
    });

    it("returns null scoreDelta when only one team is present", () => {
      const data = aFakeScoreProgressionWith({
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1 } }],
          deathTimeline: [],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.scoreDelta).toBeNull();
    });

    it("returns null scoreDelta when more than 2 teams are present", () => {
      const data = aFakeScoreProgressionWith({
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0, "2": 0 } }],
          deathTimeline: [],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.scoreDelta).toBeNull();
    });

    it("returns null scoreDelta when all deltas are 0 (perfectly tied match)", () => {
      const data = aFakeScoreProgressionWith({
        timeline: {
          type: "kill-race",
          events: [
            { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 1 } },
            { timestampMs: 10000, teamId: 1, runningScores: { "0": 2, "1": 2 } },
          ],
          deathTimeline: [],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.scoreDelta).toBeNull();
    });
  });

  describe("controlPeriods", () => {
    it("returns empty controlPeriods for kill-race timeline", () => {
      const result = formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS);
      expect(result?.controlPeriods).toEqual([]);
    });

    it("returns empty controlPeriods when objective-control timeline has no control periods", () => {
      const data = aFakeScoreProgressionWith({
        timeline: {
          type: "objective-control",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          controlPeriods: [],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.controlPeriods).toEqual([]);
    });

    it("maps controlling team id to team color for each control period", () => {
      const data = aFakeScoreProgressionWith({
        timeline: {
          type: "objective-control",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          controlPeriods: [
            { startMs: 0, endMs: 5000, controllingTeamId: 0 },
            { startMs: 5000, endMs: 10000, controllingTeamId: 1 },
          ],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.controlPeriods).toEqual([
        { startMs: 0, endMs: 5000, color: "#0000ff" },
        { startMs: 5000, endMs: 10000, color: "#ff0000" },
      ]);
    });

    it("sets color to null for contested periods with no controlling team", () => {
      const data = aFakeScoreProgressionWith({
        timeline: {
          type: "objective-control",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          controlPeriods: [{ startMs: 2000, endMs: 4000, controllingTeamId: null }],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.controlPeriods).toEqual([{ startMs: 2000, endMs: 4000, color: null }]);
    });
  });

  describe("KOTH timeline (mode=12)", () => {
    const kothData = aFakeScoreProgressionWith({
      mode: 12,
      durationMs: 60000,
      respawnDurationMs: null,
      timeline: {
        type: "objective-control",
        events: [
          { timestampMs: 2500, teamId: 0, runningScores: { "0": 1, "1": 0 } },
          { timestampMs: 5000, teamId: 0, runningScores: { "0": 2, "1": 0 } },
          { timestampMs: 12500, teamId: 1, runningScores: { "0": 2, "1": 1 } },
          { timestampMs: 20000, teamId: 0, runningScores: { "0": 3, "1": 1 } },
          { timestampMs: 35000, teamId: 1, runningScores: { "0": 3, "1": 2 } },
          { timestampMs: 37500, teamId: 1, runningScores: { "0": 3, "1": 3 } },
        ],
        controlPeriods: [
          { startMs: 0, endMs: 30000, controllingTeamId: 0 },
          { startMs: 30000, endMs: 60000, controllingTeamId: 1 },
        ],
      },
    });

    it("returns one hill per control period", () => {
      const result = formatScoreProgression(kothData, TEAM_COLORS);
      expect(result?.kothHills).toHaveLength(2);
    });

    it("assigns 1-based hillIndex to each hill", () => {
      const result = formatScoreProgression(kothData, TEAM_COLORS);
      expect(result?.kothHills?.[0]?.hillIndex).toBe(1);
      expect(result?.kothHills?.[1]?.hillIndex).toBe(2);
    });

    it("sets hill startMs and endMs from the control period", () => {
      const result = formatScoreProgression(kothData, TEAM_COLORS);
      expect(result?.kothHills?.[0]?.startMs).toBe(0);
      expect(result?.kothHills?.[0]?.endMs).toBe(30000);
    });

    it("identifies the winner as the team with the last mode event before the hill transition", () => {
      const result = formatScoreProgression(kothData, TEAM_COLORS);
      expect(result?.kothHills?.[0]?.winnerTeamId).toBe(0);
      expect(result?.kothHills?.[1]?.winnerTeamId).toBe(1);
    });

    it("sets winnerColor from the winning team's color", () => {
      const result = formatScoreProgression(kothData, TEAM_COLORS);
      expect(result?.kothHills?.[0]?.winnerColor).toBe("#0000ff");
      expect(result?.kothHills?.[1]?.winnerColor).toBe("#ff0000");
    });

    it("produces team occupancy percentages for each hill", () => {
      const result = formatScoreProgression(kothData, TEAM_COLORS);
      const hill1 = result?.kothHills?.[0];
      expect(hill1?.teamOccupancies).toHaveLength(2);
      expect(hill1?.teamOccupancies.every((o) => o.percentage >= 0 && o.percentage <= 100)).toBe(true);
    });

    it("produces segments covering the full hill period with no gaps", () => {
      const result = formatScoreProgression(kothData, TEAM_COLORS);
      const hill1 = result?.kothHills?.[0];
      if (hill1 == null) {
        return;
      }
      const covered = hill1.segments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);
      expect(covered).toBe(hill1.endMs - hill1.startMs);
    });

    it("assigns team colors to occupied segments and null to unoccupied segments", () => {
      const result = formatScoreProgression(kothData, TEAM_COLORS);
      const hill1 = result?.kothHills?.[0];
      for (const seg of hill1?.segments ?? []) {
        if (seg.teamId != null) {
          expect(seg.color).not.toBeNull();
        } else {
          expect(seg.color).toBeNull();
        }
      }
    });

    it("returns empty teamLines for KOTH", () => {
      const result = formatScoreProgression(kothData, TEAM_COLORS);
      expect(result?.teamLines).toHaveLength(0);
    });

    it("returns null scoreDelta for KOTH", () => {
      const result = formatScoreProgression(kothData, TEAM_COLORS);
      expect(result?.scoreDelta).toBeNull();
    });

    it("falls back to standard progression when controlPeriods is empty (kothHills is null)", () => {
      const emptyPeriods = aFakeScoreProgressionWith({
        mode: 12,
        durationMs: 60000,
        respawnDurationMs: null,
        timeline: {
          type: "objective-control",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          controlPeriods: [],
        },
      });
      const result = formatScoreProgression(emptyPeriods, TEAM_COLORS);
      expect(result?.kothHills).toBeNull();
      expect(result?.teamLines).toHaveLength(2);
    });

    it("produces an entirely unoccupied segment for a hill with no events", () => {
      const noEvents = aFakeScoreProgressionWith({
        mode: 12,
        durationMs: 30000,
        respawnDurationMs: null,
        timeline: {
          type: "objective-control",
          events: [{ timestampMs: 15000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          controlPeriods: [
            { startMs: 0, endMs: 10000, controllingTeamId: null },
            { startMs: 10000, endMs: 30000, controllingTeamId: 0 },
          ],
        },
      });
      const result = formatScoreProgression(noEvents, TEAM_COLORS);
      const emptyHill = result?.kothHills?.[0];
      expect(emptyHill?.segments).toHaveLength(1);
      expect(emptyHill?.segments[0]?.teamId).toBeNull();
      expect(emptyHill?.winnerTeamId).toBeNull();
    });

    it("inserts an unoccupied gap when the same team leaves and returns with a gap greater than 2 ticks", () => {
      const sameTeamGap = aFakeScoreProgressionWith({
        mode: 12,
        durationMs: 60000,
        respawnDurationMs: null,
        timeline: {
          type: "objective-control",
          events: [
            { timestampMs: 2500, teamId: 0, runningScores: { "0": 1, "1": 0 } },
            { timestampMs: 5000, teamId: 0, runningScores: { "0": 2, "1": 0 } },
            { timestampMs: 20000, teamId: 0, runningScores: { "0": 3, "1": 0 } },
          ],
          controlPeriods: [{ startMs: 0, endMs: 60000, controllingTeamId: 0 }],
        },
      });
      const result = formatScoreProgression(sameTeamGap, TEAM_COLORS);
      const hill = result?.kothHills?.[0];
      const unoccupiedSegments = hill?.segments.filter((s) => s.teamId === null) ?? [];
      expect(unoccupiedSegments.length).toBeGreaterThan(0);
    });

    it("returns 0% occupancy for all teams when hillDurationMs is 0", () => {
      const zeroDuration = aFakeScoreProgressionWith({
        mode: 12,
        durationMs: 30000,
        respawnDurationMs: null,
        timeline: {
          type: "objective-control",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          controlPeriods: [{ startMs: 10000, endMs: 10000, controllingTeamId: 0 }],
        },
      });
      const result = formatScoreProgression(zeroDuration, TEAM_COLORS);
      const hill = result?.kothHills?.[0];
      for (const occupancy of hill?.teamOccupancies ?? []) {
        expect(occupancy.percentage).toBe(0);
      }
    });
  });

  describe("playerAdvantage", () => {
    it("returns null playerAdvantage when more than 2 teams are present", () => {
      const data = aFakeScoreProgressionWith({
        respawnDurationMs: 8000,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0, "2": 0 } }],
          deathTimeline: [{ timestampMs: 5001, teamId: 1 }],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.playerAdvantage).toBeNull();
    });

    it("returns null playerAdvantage when respawnDurationMs is null", () => {
      const data = aFakeScoreProgressionWith({ respawnDurationMs: null });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.playerAdvantage).toBeNull();
    });

    it("returns null playerAdvantage when deathTimeline is empty", () => {
      const data = aFakeScoreProgressionWith({
        respawnDurationMs: 8000,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.playerAdvantage).toBeNull();
    });

    it("returns null playerAdvantage when advantage never changes from 0", () => {
      const data = aFakeScoreProgressionWith({
        respawnDurationMs: 8000,
        durationMs: 30000,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [
            { timestampMs: 5000, teamId: 0 },
            { timestampMs: 5000, teamId: 1 },
          ],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.playerAdvantage).toBeNull();
    });

    it("computes positive advantage when team 1 has a player respawning", () => {
      const data = aFakeScoreProgressionWith({
        respawnDurationMs: 8000,
        durationMs: 30000,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [{ timestampMs: 5001, teamId: 1 }],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.playerAdvantage?.points).toEqual([
        { timestampMs: 0, score: 0 },
        { timestampMs: 5001, score: 1 },
        { timestampMs: 13001, score: 0 },
        { timestampMs: 30000, score: 0 },
      ]);
    });

    it("computes negative advantage when team 0 has a player respawning", () => {
      const data = aFakeScoreProgressionWith({
        respawnDurationMs: 8000,
        durationMs: 30000,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 12000, teamId: 1, runningScores: { "0": 0, "1": 1 } }],
          deathTimeline: [{ timestampMs: 12001, teamId: 0 }],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.playerAdvantage?.points).toEqual([
        { timestampMs: 0, score: 0 },
        { timestampMs: 12001, score: -1 },
        { timestampMs: 20001, score: 0 },
        { timestampMs: 30000, score: 0 },
      ]);
    });

    it("omits respawn completion points past durationMs", () => {
      const data = aFakeScoreProgressionWith({
        respawnDurationMs: 8000,
        durationMs: 10000,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [{ timestampMs: 5001, teamId: 1 }],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.playerAdvantage?.points).toEqual([
        { timestampMs: 0, score: 0 },
        { timestampMs: 5001, score: 1 },
        { timestampMs: 10000, score: 1 },
      ]);
    });

    it("omits respawn completion when respawnTs equals durationMs, avoiding duplicate terminal point", () => {
      const data = aFakeScoreProgressionWith({
        respawnDurationMs: 8000,
        durationMs: 13001,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [{ timestampMs: 5001, teamId: 1 }],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.playerAdvantage?.points).toEqual([
        { timestampMs: 0, score: 0 },
        { timestampMs: 5001, score: 1 },
        { timestampMs: 13001, score: 1 },
      ]);
    });

    it("sets minScore and maxScore from computed points", () => {
      const data = aFakeScoreProgressionWith({
        respawnDurationMs: 8000,
        durationMs: 30000,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [
            { timestampMs: 5001, teamId: 1 },
            { timestampMs: 12001, teamId: 0 },
          ],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.playerAdvantage?.minScore).toBe(-1);
      expect(result?.playerAdvantage?.maxScore).toBe(1);
    });

    it("bounds minScore and maxScore to ±teamSize when teamSize is provided", () => {
      const data = aFakeScoreProgressionWith({
        respawnDurationMs: 8000,
        durationMs: 30000,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [{ timestampMs: 5001, teamId: 1 }],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS, 4);
      expect(result?.playerAdvantage?.minScore).toBe(-4);
      expect(result?.playerAdvantage?.maxScore).toBe(4);
    });
  });
});
