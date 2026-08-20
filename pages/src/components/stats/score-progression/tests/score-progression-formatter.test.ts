import { GameVariantCategory } from "halo-infinite-api";
import { describe, expect, it } from "vitest";
import { formatScoreProgression } from "../score-progression-formatter";
import { aFakeScoreProgressionWith } from "../fakes/score-progression.fake";

const TEAM_COLORS = [
  { id: "eagle", hex: "#0000ff", name: "Eagle" },
  { id: "cobra", hex: "#ff0000", name: "Cobra" },
] as const;

const KOTH_MODE = GameVariantCategory.MultiplayerKingOfTheHill;

// Hill 1: team 0 holds the full period (0→30000); team 0 captured at t=30000.
// Hill 2: team 1 holds the full period (30000→55000); team 1 captured at t=55000.
// Capture timestamps must match a score event because buildHillCaptureTimestamps
// always uses the capturing team's last score event timestamp.
const KOTH_DATA = aFakeScoreProgressionWith({
  mode: KOTH_MODE,
  durationMs: 60000,
  respawnDurationMs: null,
  timeline: {
    type: "objective-control",
    events: [
      { timestampMs: 2500, teamId: 0, runningScores: { "0": 1, "1": 0 } },
      { timestampMs: 5000, teamId: 0, runningScores: { "0": 2, "1": 0 } },
      { timestampMs: 12500, teamId: 1, runningScores: { "0": 2, "1": 1 } },
      { timestampMs: 20000, teamId: 0, runningScores: { "0": 3, "1": 1 } },
      { timestampMs: 30000, teamId: 0, runningScores: { "0": 4, "1": 1 } },
      { timestampMs: 32500, teamId: 1, runningScores: { "0": 4, "1": 2 } },
      { timestampMs: 45000, teamId: 1, runningScores: { "0": 4, "1": 3 } },
      { timestampMs: 55000, teamId: 1, runningScores: { "0": 4, "1": 4 } },
    ],
    controlPeriods: [
      { startMs: 0, endMs: 30000, controllingTeamId: 0 },
      { startMs: 30000, endMs: 60000, controllingTeamId: 1 },
    ],
    hillCaptureTimestamps: [30000, 55000],
  },
});

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

  describe("kothHills (KOTH mode)", () => {
    it("returns null kothHills when timeline is kill-race", () => {
      const result = formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS);
      expect(result?.kothHills).toBeNull();
    });

    it("returns null kothHills when mode is not KOTH even with objective-control timeline", () => {
      const data = aFakeScoreProgressionWith({
        mode: 9,
        timeline: {
          type: "objective-control",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          controlPeriods: [{ startMs: 0, endMs: 5000, controllingTeamId: 0 }],
          hillCaptureTimestamps: [5000],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.kothHills).toBeNull();
    });

    it("returns one hill per capture plus a trailing uncaptured hill", () => {
      const result = formatScoreProgression(KOTH_DATA, TEAM_COLORS);
      // KOTH_DATA has 2 capture timestamps and durationMs=60000 > last capture (55000)
      expect(result?.kothHills).toHaveLength(3);
    });

    it("assigns 1-based hillIndex to each hill including the trailing one", () => {
      const result = formatScoreProgression(KOTH_DATA, TEAM_COLORS);
      expect(result?.kothHills?.[0]?.hillIndex).toBe(1);
      expect(result?.kothHills?.[1]?.hillIndex).toBe(2);
      expect(result?.kothHills?.[2]?.hillIndex).toBe(3);
    });

    it("sets hill startMs from match start and endMs from the capture timestamp", () => {
      const result = formatScoreProgression(KOTH_DATA, TEAM_COLORS);
      expect(result?.kothHills?.[0]?.startMs).toBe(0);
      expect(result?.kothHills?.[0]?.endMs).toBe(30000);
    });

    it("identifies the winner as the team whose score event matches the capture timestamp", () => {
      const result = formatScoreProgression(KOTH_DATA, TEAM_COLORS);
      expect(result?.kothHills?.[0]?.winnerTeamId).toBe(0);
      expect(result?.kothHills?.[1]?.winnerTeamId).toBe(1);
    });

    it("awards the hill to the team whose score event is the capture timestamp even when they are a minority in the control period", () => {
      const data = aFakeScoreProgressionWith({
        mode: KOTH_MODE,
        durationMs: 60000,
        timeline: {
          type: "objective-control",
          events: [
            { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
            { timestampMs: 15000, teamId: 0, runningScores: { "0": 2, "1": 0 } },
            { timestampMs: 30000, teamId: 1, runningScores: { "0": 2, "1": 1 } },
          ],
          controlPeriods: [{ startMs: 0, endMs: 30000, controllingTeamId: 0 }],
          hillCaptureTimestamps: [30000],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      // Team 1 (Cobra) has the score event at the capture timestamp (t=30000),
      // even though Team 0 (Eagle) majority-controlled the period — Cobra should win.
      expect(result?.kothHills?.[0]?.winnerTeamId).toBe(1);
    });

    it("sets winnerColor from the winning team's color", () => {
      const result = formatScoreProgression(KOTH_DATA, TEAM_COLORS);
      expect(result?.kothHills?.[0]?.winnerColor).toBe("#0000ff");
      expect(result?.kothHills?.[1]?.winnerColor).toBe("#ff0000");
    });

    it("produces team occupancy percentages for each hill", () => {
      const result = formatScoreProgression(KOTH_DATA, TEAM_COLORS);
      const hill1 = result?.kothHills?.[0];
      expect(hill1?.teamCaptureProgress).toHaveLength(2);
      expect(hill1?.teamCaptureProgress.every((o) => o.percentage >= 0 && o.percentage <= 100)).toBe(true);
    });

    it("sets 0% occupancy for a team that never held the hill", () => {
      const result = formatScoreProgression(KOTH_DATA, TEAM_COLORS);
      const hill2 = result?.kothHills?.[1];
      const eagleOccupancy = hill2?.teamCaptureProgress.find((o) => o.teamId === 0);
      expect(eagleOccupancy?.percentage).toBe(0);
    });

    it("produces segments covering the full hill period with no gaps", () => {
      expect.assertions(1);
      const result = formatScoreProgression(KOTH_DATA, TEAM_COLORS);
      const hill1 = result?.kothHills?.[0];
      if (hill1 == null) {
        return;
      }
      const covered = hill1.segments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0);
      expect(covered).toBe(hill1.endMs - hill1.startMs);
    });

    it("assigns team colors to occupied segments and null to unoccupied segments", () => {
      const result = formatScoreProgression(KOTH_DATA, TEAM_COLORS);
      const hill1 = result?.kothHills?.[0];
      const occupied = hill1?.segments.filter((s) => s.teamId != null) ?? [];
      const unoccupied = hill1?.segments.filter((s) => s.teamId === null) ?? [];
      expect(occupied.every((s) => s.color != null)).toBe(true);
      expect(unoccupied.every((s) => s.color === null)).toBe(true);
    });

    it("includes a trailing uncaptured hill when hillCaptureTimestamps does not reach durationMs", () => {
      const data = aFakeScoreProgressionWith({
        mode: KOTH_MODE,
        durationMs: 60000,
        timeline: {
          type: "objective-control",
          events: [
            { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
            { timestampMs: 45000, teamId: 1, runningScores: { "0": 1, "1": 1 } },
          ],
          controlPeriods: [{ startMs: 0, endMs: 30000, controllingTeamId: 0 }],
          hillCaptureTimestamps: [30000],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.kothHills).toHaveLength(2);
      expect(result?.kothHills?.[1]?.endMs).toBe(60000);
      expect(result?.kothHills?.[1]?.winnerTeamId).toBeNull();
    });

    it("does not add a trailing hill when the last capture timestamp equals durationMs", () => {
      const data = aFakeScoreProgressionWith({
        mode: KOTH_MODE,
        durationMs: 60000,
        timeline: {
          type: "objective-control",
          events: [
            { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
            { timestampMs: 60000, teamId: 1, runningScores: { "0": 1, "1": 1 } },
          ],
          controlPeriods: [
            { startMs: 0, endMs: 30000, controllingTeamId: 0 },
            { startMs: 30000, endMs: 60000, controllingTeamId: 1 },
          ],
          hillCaptureTimestamps: [30000, 60000],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.kothHills).toHaveLength(2);
      expect(result?.kothHills?.[1]?.endMs).toBe(60000);
      expect(result?.kothHills?.[1]?.winnerTeamId).toBe(1);
    });

    it("discards a sub-2-second trailing sliver when the match ends on the final capture", () => {
      const data = aFakeScoreProgressionWith({
        mode: KOTH_MODE,
        durationMs: 60000,
        timeline: {
          type: "objective-control",
          events: [
            { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
            { timestampMs: 59100, teamId: 1, runningScores: { "0": 1, "1": 1 } },
          ],
          controlPeriods: [
            { startMs: 0, endMs: 30000, controllingTeamId: 0 },
            { startMs: 30000, endMs: 60000, controllingTeamId: 1 },
          ],
          hillCaptureTimestamps: [30000, 59100],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.kothHills).toHaveLength(2);
      expect(result?.kothHills?.[1]?.endMs).toBe(59100);
      expect(result?.kothHills?.[1]?.winnerTeamId).toBe(1);
    });

    it("computes capture progress from score ticks even when controlPeriods is empty", () => {
      const data = aFakeScoreProgressionWith({
        mode: KOTH_MODE,
        durationMs: 60000,
        timeline: {
          type: "objective-control",
          events: [
            { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
            { timestampMs: 30000, teamId: 0, runningScores: { "0": 2, "1": 0 } },
            { timestampMs: 45000, teamId: 1, runningScores: { "0": 2, "1": 1 } },
          ],
          controlPeriods: [],
          hillCaptureTimestamps: [30000],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.kothHills).toHaveLength(2);
      expect(result?.kothHills?.[0]?.winnerTeamId).toBe(0);
      // hill 1 winner reads 100%; hill 2 has one Cobra tick of the 8-tick meter (13%)
      expect(result?.kothHills?.[0]?.teamCaptureProgress.map((p) => p.percentage)).toEqual([100, 0]);
      expect(result?.kothHills?.[1]?.teamCaptureProgress.map((p) => p.percentage)).toEqual([0, 13]);
    });

    it("renders a control window straddling a capture boundary as unoccupied in the next hill", () => {
      // Team 1 captures hill 1 at 30000 inside a control window running to 40000; team 1 never
      // scores in hill 2, so the window's spillover into hill 2 must not paint team 1's colour.
      const data = aFakeScoreProgressionWith({
        mode: KOTH_MODE,
        durationMs: 90000,
        timeline: {
          type: "objective-control",
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
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      const hill2Segments = result?.kothHills?.[1]?.segments ?? [];
      // the nulled spillover (30000-40000) merges with the adjacent gap into one unoccupied run
      const spillover = hill2Segments.find((s) => s.startMs === 30000 && s.endMs === 45000);
      expect(spillover?.teamId).toBeNull();
      const corroborated = hill2Segments.find((s) => s.startMs === 45000 && s.endMs === 60000);
      expect(corroborated?.teamId).toBe(0);
    });

    it("pins the winner's capture progress at 100% and estimates the loser from their ticks", () => {
      const result = formatScoreProgression(KOTH_DATA, TEAM_COLORS);
      const hill1 = result?.kothHills?.[0];
      // Team 0 captures hill 1 at 30000 → 100%; Team 1 had 1 of 8 meter ticks inside it → 13%
      expect(hill1?.teamCaptureProgress.map((p) => p.percentage)).toEqual([100, 13]);
      const hill2 = result?.kothHills?.[1];
      // Team 1 captures hill 2 → 100%; Team 0 never scored inside it → 0%
      expect(hill2?.teamCaptureProgress.map((p) => p.percentage)).toEqual([0, 100]);
    });

    it("returns a single uncaptured hill when hillCaptureTimestamps is empty", () => {
      const data = aFakeScoreProgressionWith({
        mode: KOTH_MODE,
        durationMs: 60000,
        timeline: {
          type: "objective-control",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          controlPeriods: [],
          hillCaptureTimestamps: [],
        },
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.kothHills).toHaveLength(1);
      expect(result?.kothHills?.[0]?.startMs).toBe(0);
      expect(result?.kothHills?.[0]?.endMs).toBe(60000);
      expect(result?.kothHills?.[0]?.winnerTeamId).toBeNull();
    });

    it("returns empty teamLines for a KOTH match", () => {
      const result = formatScoreProgression(KOTH_DATA, TEAM_COLORS);
      expect(result?.teamLines).toEqual([]);
    });
  });
});
