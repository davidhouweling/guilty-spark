import { describe, expect, it } from "vitest";
import { formatScoreProgression } from "../score-progression-formatter";
import { aFakeScoreProgressionWith } from "../fakes/score-progression.fake";
import { aFakeKothTimelineWith } from "../modes/koth/fakes/koth-timeline.fake";
import type { KothViewData, ScoreLinesViewData, ScoreProgressionViewData } from "../types";

const TEAM_COLORS = [
  { id: "eagle", hex: "#0000ff", name: "Eagle" },
  { id: "cobra", hex: "#ff0000", name: "Cobra" },
] as const;

function asScoreLines(result: ScoreProgressionViewData | null): ScoreLinesViewData {
  if (result?.kind !== "score-lines") {
    throw new Error("expected score-lines view data");
  }
  return result;
}

function asKoth(result: ScoreProgressionViewData | null): KothViewData {
  if (result?.kind !== "koth") {
    throw new Error("expected koth view data");
  }
  return result;
}

describe("formatScoreProgression", () => {
  it("returns null when scoreProgression is null", () => {
    expect(formatScoreProgression(null, TEAM_COLORS)).toBeNull();
  });

  it("returns null when timeline has no events", () => {
    const data = aFakeScoreProgressionWith({
      timeline: { type: "kill-race", events: [], deathTimeline: [], respawnDurationMs: 8000 },
    });
    expect(formatScoreProgression(data, TEAM_COLORS)).toBeNull();
  });

  it("returns null when a koth timeline has no events", () => {
    const data = aFakeScoreProgressionWith({ timeline: aFakeKothTimelineWith({ events: [] }) });
    expect(formatScoreProgression(data, TEAM_COLORS)).toBeNull();
  });

  it("returns score-lines view data for a kill-race timeline", () => {
    const result = formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS);
    expect(result?.kind).toBe("score-lines");
  });

  it("returns one team line per team derived from the first event runningScores", () => {
    const result = asScoreLines(formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS));
    expect(result.teamLines).toHaveLength(2);
    expect(result.teamLines[0]?.teamId).toBe(0);
    expect(result.teamLines[1]?.teamId).toBe(1);
  });

  it("assigns team colors by slot index order", () => {
    const result = asScoreLines(formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS));
    expect(result.teamLines[0]?.color).toBe("#0000ff");
    expect(result.teamLines[1]?.color).toBe("#ff0000");
  });

  it("assigns team names from teamId using getTeamName", () => {
    const result = asScoreLines(formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS));
    expect(result.teamLines[0]?.name).toBe("Eagle");
    expect(result.teamLines[1]?.name).toBe("Cobra");
  });

  it("assigns team names from teamId even when teamColors has no entries", () => {
    const result = asScoreLines(formatScoreProgression(aFakeScoreProgressionWith(), []));
    expect(result.teamLines[0]?.name).toBe("Eagle");
    expect(result.teamLines[1]?.name).toBe("Cobra");
  });

  it("uses getTeamColorOrDefault fallback colors when teamColors has no entries", () => {
    const result = asScoreLines(formatScoreProgression(aFakeScoreProgressionWith(), []));
    expect(result.teamLines[0]?.color).toBe("#FE3939");
    expect(result.teamLines[1]?.color).toBe("#3B9DFF");
  });

  it("starts each team line at (0, 0)", () => {
    const result = asScoreLines(formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS));
    expect(result.teamLines[0]?.points[0]).toEqual({ timestampMs: 0, score: 0 });
    expect(result.teamLines[1]?.points[0]).toEqual({ timestampMs: 0, score: 0 });
  });

  it("produces step-function points for each kill event with sync points for other teams", () => {
    const result = asScoreLines(formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS));
    const team0Points = result.teamLines[0]?.points ?? [];
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
    const result = asScoreLines(formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS));
    const lastTeam0 = result.teamLines[0]?.points.at(-1);
    const lastTeam1 = result.teamLines[1]?.points.at(-1);
    expect(lastTeam0?.timestampMs).toBe(600000);
    expect(lastTeam1?.timestampMs).toBe(600000);
  });

  it("adds a sync point for a team with no kills at each opponent kill timestamp", () => {
    const data = aFakeScoreProgressionWith({
      timeline: {
        type: "kill-race",
        events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
        deathTimeline: [],
        respawnDurationMs: 8000,
      },
    });
    const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
    const team1Points = result.teamLines[1]?.points ?? [];
    expect(team1Points).toEqual([
      { timestampMs: 0, score: 0 },
      { timestampMs: 5000, score: 0 },
      { timestampMs: 600000, score: 0 },
    ]);
  });

  it("passes through durationMs from the source data", () => {
    const result = asScoreLines(formatScoreProgression(aFakeScoreProgressionWith({ durationMs: 480000 }), TEAM_COLORS));
    expect(result.durationMs).toBe(480000);
  });

  describe("scoreDelta", () => {
    it("computes delta points from events with one point per event plus start and terminal", () => {
      const result = asScoreLines(formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS));
      expect(result.scoreDelta?.points).toEqual([
        { timestampMs: 0, score: 0 },
        { timestampMs: 5000, score: 1 },
        { timestampMs: 12000, score: 0 },
        { timestampMs: 20000, score: 1 },
        { timestampMs: 600000, score: 1 },
      ]);
    });

    it("sets minScore and maxScore from the computed delta points", () => {
      const result = asScoreLines(formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS));
      expect(result.scoreDelta?.minScore).toBe(0);
      expect(result.scoreDelta?.maxScore).toBe(1);
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
          respawnDurationMs: 8000,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.scoreDelta?.minScore).toBe(-1);
      expect(result.scoreDelta?.maxScore).toBe(1);
    });

    it("returns null scoreDelta when only one team is present", () => {
      const data = aFakeScoreProgressionWith({
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1 } }],
          deathTimeline: [],
          respawnDurationMs: 8000,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.scoreDelta).toBeNull();
    });

    it("returns null scoreDelta when more than 2 teams are present", () => {
      const data = aFakeScoreProgressionWith({
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0, "2": 0 } }],
          deathTimeline: [],
          respawnDurationMs: 8000,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.scoreDelta).toBeNull();
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
          respawnDurationMs: 8000,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.scoreDelta).toBeNull();
    });
  });

  describe("playerAdvantage", () => {
    it("returns null playerAdvantage when more than 2 teams are present", () => {
      const data = aFakeScoreProgressionWith({
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0, "2": 0 } }],
          deathTimeline: [{ timestampMs: 5001, teamId: 1 }],
          respawnDurationMs: 8000,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.playerAdvantage).toBeNull();
    });

    it("returns null playerAdvantage when the timeline respawnDurationMs is null", () => {
      const data = aFakeScoreProgressionWith({
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [{ timestampMs: 5001, teamId: 1 }],
          respawnDurationMs: null,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.playerAdvantage).toBeNull();
    });

    it("returns null playerAdvantage when deathTimeline is empty", () => {
      const data = aFakeScoreProgressionWith({
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [],
          respawnDurationMs: 8000,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.playerAdvantage).toBeNull();
    });

    it("returns null playerAdvantage when advantage never changes from 0", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 30000,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [
            { timestampMs: 5000, teamId: 0 },
            { timestampMs: 5000, teamId: 1 },
          ],
          respawnDurationMs: 8000,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.playerAdvantage).toBeNull();
    });

    it("computes positive advantage when team 1 has a player respawning", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 30000,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [{ timestampMs: 5001, teamId: 1 }],
          respawnDurationMs: 8000,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.playerAdvantage?.points).toEqual([
        { timestampMs: 0, score: 0 },
        { timestampMs: 5001, score: 1 },
        { timestampMs: 13001, score: 0 },
        { timestampMs: 30000, score: 0 },
      ]);
    });

    it("computes negative advantage when team 0 has a player respawning", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 30000,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 12000, teamId: 1, runningScores: { "0": 0, "1": 1 } }],
          deathTimeline: [{ timestampMs: 12001, teamId: 0 }],
          respawnDurationMs: 8000,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.playerAdvantage?.points).toEqual([
        { timestampMs: 0, score: 0 },
        { timestampMs: 12001, score: -1 },
        { timestampMs: 20001, score: 0 },
        { timestampMs: 30000, score: 0 },
      ]);
    });

    it("omits respawn completion points past durationMs", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 10000,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [{ timestampMs: 5001, teamId: 1 }],
          respawnDurationMs: 8000,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.playerAdvantage?.points).toEqual([
        { timestampMs: 0, score: 0 },
        { timestampMs: 5001, score: 1 },
        { timestampMs: 10000, score: 1 },
      ]);
    });

    it("omits respawn completion when respawnTs equals durationMs, avoiding duplicate terminal point", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 13001,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [{ timestampMs: 5001, teamId: 1 }],
          respawnDurationMs: 8000,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.playerAdvantage?.points).toEqual([
        { timestampMs: 0, score: 0 },
        { timestampMs: 5001, score: 1 },
        { timestampMs: 13001, score: 1 },
      ]);
    });

    it("sets minScore and maxScore from computed points", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 30000,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [
            { timestampMs: 5001, teamId: 1 },
            { timestampMs: 12001, teamId: 0 },
          ],
          respawnDurationMs: 8000,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.playerAdvantage?.minScore).toBe(-1);
      expect(result.playerAdvantage?.maxScore).toBe(1);
    });

    it("bounds minScore and maxScore to ±teamSize when teamSize is provided", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 30000,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [{ timestampMs: 5001, teamId: 1 }],
          respawnDurationMs: 8000,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS, 4));
      expect(result.playerAdvantage?.minScore).toBe(-4);
      expect(result.playerAdvantage?.maxScore).toBe(4);
    });
  });

  describe("koth dispatch", () => {
    it("returns koth view data for a koth timeline", () => {
      const data = aFakeScoreProgressionWith({ durationMs: 60000, timeline: aFakeKothTimelineWith() });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.kind).toBe("koth");
    });

    it("builds one hill per capture plus a trailing uncaptured hill", () => {
      // the koth fake has 2 capture timestamps and durationMs=60000 > last capture (55000)
      const data = aFakeScoreProgressionWith({ durationMs: 60000, timeline: aFakeKothTimelineWith() });
      const result = asKoth(formatScoreProgression(data, TEAM_COLORS));
      expect(result.hills).toHaveLength(3);
      expect(result.durationMs).toBe(60000);
    });

    it("maps team colors onto hills by slot index order", () => {
      const data = aFakeScoreProgressionWith({ durationMs: 60000, timeline: aFakeKothTimelineWith() });
      const result = asKoth(formatScoreProgression(data, TEAM_COLORS));
      expect(result.hills[0]?.winnerColor).toBe("#0000ff");
      expect(result.hills[1]?.winnerColor).toBe("#ff0000");
    });

    it("uses getTeamColorOrDefault fallback colors for hills when teamColors has no entries", () => {
      const data = aFakeScoreProgressionWith({ durationMs: 60000, timeline: aFakeKothTimelineWith() });
      const result = asKoth(formatScoreProgression(data, []));
      expect(result.hills[0]?.winnerColor).toBe("#FE3939");
      expect(result.hills[1]?.winnerColor).toBe("#3B9DFF");
    });
  });
});
