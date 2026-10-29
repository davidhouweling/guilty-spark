import { describe, expect, it } from "vitest";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { formatScoreProgression } from "../score-progression-formatter";
import { HILL_PROGRESS_SCALE, ROUND_POINTS_SCALE } from "../score-scales";
import { aFakeScoreProgressionWith } from "../fakes/score-progression.fake";
import { aFakeKothTimelineWith } from "../modes/koth/fakes/koth-timeline.fake";
import { aFakeOddballTimelineWith } from "../modes/oddball/fakes/oddball-timeline.fake";
import { aFakeStrongholdsTimelineWith } from "../modes/strongholds/fakes/strongholds-timeline.fake";
import { aFakeCtfFlagRunWith } from "../modes/ctf/fakes/ctf-flag-run.fake";
import { aFakeCtfTimelineWith } from "../modes/ctf/fakes/ctf-timeline.fake";
import type {
  CtfViewData,
  KothViewData,
  OddballViewData,
  ScoreLinesViewData,
  ScoreProgressionViewData,
  StrongholdsViewData,
} from "../types";

const TEAM_COLORS = [
  { id: "eagle", hex: "#0000ff", name: "Eagle" },
  { id: "cobra", hex: "#ff0000", name: "Cobra" },
] as const;

function asStrongholds(result: ScoreProgressionViewData | null): StrongholdsViewData {
  if (result?.kind !== "strongholds") {
    throw new Error("expected strongholds view data");
  }
  return result;
}

function asStrongholdsScoreLines(result: ScoreProgressionViewData | null): ScoreLinesViewData {
  return asStrongholds(result).scoreLines;
}

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

function asOddball(result: ScoreProgressionViewData | null): OddballViewData {
  if (result?.kind !== "oddball") {
    throw new Error("expected oddball view data");
  }
  return result;
}

function asCtf(result: ScoreProgressionViewData | null): CtfViewData {
  if (result?.kind !== "ctf") {
    throw new Error("expected ctf view data");
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

    it("marks kill-race deltas as stepped", () => {
      const result = asScoreLines(formatScoreProgression(aFakeScoreProgressionWith(), TEAM_COLORS));
      expect(result.scoreDelta?.lineType).toBe("step");
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

    it("clamps team lines to the match duration when a trailing event overruns it", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 600000,
        timeline: {
          type: "kill-race",
          events: [
            { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
            { timestampMs: 605000, teamId: 0, runningScores: { "0": 2, "1": 0 } },
          ],
          deathTimeline: [],
          respawnDurationMs: 8000,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
      const timestamps = result.teamLines[0]?.points.map((point) => point.timestampMs) ?? [];
      expect(Math.max(...timestamps)).toBe(600000);
      expect(result.teamLines[0]?.points.at(-1)).toEqual({ timestampMs: 600000, score: 1 });
    });

    it("clamps delta points to the match duration when a trailing event overruns it", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 600000,
        timeline: {
          type: "kill-race",
          events: [
            { timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } },
            { timestampMs: 10000, teamId: 1, runningScores: { "0": 1, "1": 3 } },
            { timestampMs: 605000, teamId: 0, runningScores: { "0": 2, "1": 3 } },
          ],
          deathTimeline: [],
          respawnDurationMs: 8000,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
      const last = result.scoreDelta?.points.at(-1);
      expect(last).toEqual({ timestampMs: 600000, score: -2 });
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

    it("clamps advantage points to the match duration when a trailing death overruns it", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 30000,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [
            { timestampMs: 5001, teamId: 1 },
            { timestampMs: 30500, teamId: 0 },
          ],
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

  describe("empty sampled score lines", () => {
    it("returns null oddball score lines when every round falls outside the match duration", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 60000,
        timeline: aFakeOddballTimelineWith({
          rounds: [
            {
              roundIndex: 0,
              startMs: 70000,
              endMs: 90000,
              endedByCap: false,
              winnerTeamId: 0,
              scores: { "0": 20, "1": 10 },
              carrySegments: [],
              points: [],
            },
          ],
        }),
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      if (result?.kind !== "oddball") {
        throw new Error("expected oddball view data");
      }
      expect(result.scoreLines).toBeNull();
    });
  });

  describe("koth score lines", () => {
    it("builds per-hill meter lines in percent with hill boundaries, a linear delta, and player advantage", () => {
      const data = aFakeScoreProgressionWith({ durationMs: 60000, timeline: aFakeKothTimelineWith() });
      const result = formatScoreProgression(data, TEAM_COLORS);
      if (result?.kind !== "koth") {
        throw new Error("expected koth view data");
      }
      // hill 1's winner fills the meter at the capture, then it resets for the next hill
      expect(result.scoreLines?.scoreScale).toEqual(HILL_PROGRESS_SCALE);
      expect(result.scoreLines?.teamLines[0]?.points).toContainEqual({ timestampMs: 30000, score: 100 });
      expect(result.scoreLines?.teamLines[0]?.points).toContainEqual({ timestampMs: 30000, score: 0 });
      // the trailing uncaptured hill holds at zero through the match end
      expect(result.scoreLines?.teamLines[1]?.points.at(-1)).toEqual({ timestampMs: 60000, score: 0 });
      expect(result.scoreLines?.scoreDelta?.lineType).toBe("linear");
      expect(result.scoreLines?.playerAdvantage).not.toBeNull();
      expect(result.scoreLines?.roundBoundaries).toEqual([30000, 55000]);
    });

    it("builds one cumulative tick window when no captures are identifiable", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 60000,
        timeline: aFakeKothTimelineWith({ hillCaptureTimestamps: [] }),
      });
      const result = formatScoreProgression(data, TEAM_COLORS);
      if (result?.kind !== "koth") {
        throw new Error("expected koth view data");
      }
      expect(result.scoreLines?.roundBoundaries).toEqual([]);
      expect(result.scoreLines?.teamLines[1]?.points.at(-1)).toEqual({ timestampMs: 60000, score: 50 });
    });
  });

  describe("oddball dispatch", () => {
    it("labels the oddball delta as round points", () => {
      const data = aFakeScoreProgressionWith({ durationMs: 60000, timeline: aFakeOddballTimelineWith() });
      const result = asOddball(formatScoreProgression(data, TEAM_COLORS));
      expect(result.scoreLines?.scoreScale).toEqual(ROUND_POINTS_SCALE);
    });

    it("returns oddball view data for an oddball timeline", () => {
      const data = aFakeScoreProgressionWith({ durationMs: 460000, timeline: aFakeOddballTimelineWith() });
      const result = formatScoreProgression(data, TEAM_COLORS);
      expect(result?.kind).toBe("oddball");
    });

    it("returns null when an oddball timeline has no rounds", () => {
      const data = aFakeScoreProgressionWith({ timeline: aFakeOddballTimelineWith({ rounds: [] }) });
      expect(formatScoreProgression(data, TEAM_COLORS)).toBeNull();
    });

    it("returns null when the first round has an empty scores record", () => {
      const timeline = aFakeOddballTimelineWith();
      const [firstRound] = timeline.rounds;
      const data = aFakeScoreProgressionWith({
        timeline: aFakeOddballTimelineWith({ rounds: [{ ...firstRound, scores: {} }] }),
      });
      expect(formatScoreProgression(data, TEAM_COLORS)).toBeNull();
    });

    it("builds one round per timeline round with team ids derived from round scores", () => {
      const data = aFakeScoreProgressionWith({ durationMs: 460000, timeline: aFakeOddballTimelineWith() });
      const result = asOddball(formatScoreProgression(data, TEAM_COLORS));
      expect(result.rounds).toHaveLength(2);
      expect(result.durationMs).toBe(460000);
      expect(result.rounds[0]?.teamScores.map((o) => o.teamId)).toEqual([0, 1]);
    });

    it("builds per-round score lines with a linear delta and round boundaries", () => {
      const data = aFakeScoreProgressionWith({ durationMs: 460000, timeline: aFakeOddballTimelineWith() });
      const result = asOddball(formatScoreProgression(data, TEAM_COLORS));
      expect(result.scoreLines?.teamLines.map((line) => line.teamId)).toEqual([0, 1]);
      expect(result.scoreLines?.teamLines[1]?.points.at(-1)).toEqual({ timestampMs: 460000, score: 100 });
      expect(result.scoreLines?.scoreDelta?.lineType).toBe("linear");
      expect(result.scoreLines?.roundBoundaries).toEqual([342000]);
      expect(result.scoreLines?.playerAdvantage).not.toBeNull();
      expect(result.scoreLines?.markers).toBeNull();
    });

    it("builds a player advantage overlay from the oddball death timeline", () => {
      const data = aFakeScoreProgressionWith({ durationMs: 460000, timeline: aFakeOddballTimelineWith() });
      const result = asOddball(formatScoreProgression(data, TEAM_COLORS));
      expect(result.scoreLines?.playerAdvantage?.points.at(0)).toEqual({ timestampMs: 0, score: 0 });
      expect(result.scoreLines?.playerAdvantage?.points.at(1)).toEqual({ timestampMs: 15000, score: 1 });
    });

    it("returns null oddball player advantage when the respawn duration is unknown", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 460000,
        timeline: aFakeOddballTimelineWith({ respawnDurationMs: null }),
      });
      const result = asOddball(formatScoreProgression(data, TEAM_COLORS));
      expect(result.scoreLines?.playerAdvantage).toBeNull();
    });

    it("resets the score lines to zero at each round start", () => {
      const data = aFakeScoreProgressionWith({ durationMs: 460000, timeline: aFakeOddballTimelineWith() });
      const result = asOddball(formatScoreProgression(data, TEAM_COLORS));
      const team0ResetPoints = result.scoreLines?.teamLines[0]?.points.filter((point) => point.timestampMs === 342000);
      expect(team0ResetPoints).toEqual([
        { timestampMs: 342000, score: 20 },
        { timestampMs: 342000, score: 0 },
      ]);
    });

    it("maps team colors onto rounds by slot index order", () => {
      const data = aFakeScoreProgressionWith({ durationMs: 460000, timeline: aFakeOddballTimelineWith() });
      const result = asOddball(formatScoreProgression(data, TEAM_COLORS));
      expect(result.rounds[0]?.winnerColor).toBe("#0000ff");
      expect(result.rounds[1]?.winnerColor).toBe("#ff0000");
    });
  });

  describe("strongholds dispatch", () => {
    it("returns strongholds view data wrapping score lines and the zone strip", () => {
      const data = aFakeScoreProgressionWith({ durationMs: 100000, timeline: aFakeStrongholdsTimelineWith() });
      const result = asStrongholds(formatScoreProgression(data, TEAM_COLORS));
      expect(result.scoreLines.kind).toBe("score-lines");
      expect(result.zoneStrip).not.toBeNull();
    });

    it("returns a null zone strip when the zone timeline is empty", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 100000,
        timeline: aFakeStrongholdsTimelineWith({ zoneTimeline: [] }),
      });
      expect(asStrongholds(formatScoreProgression(data, TEAM_COLORS)).zoneStrip).toBeNull();
    });

    it("returns null when a strongholds timeline has no events", () => {
      const data = aFakeScoreProgressionWith({ timeline: aFakeStrongholdsTimelineWith({ events: [] }) });
      expect(formatScoreProgression(data, TEAM_COLORS)).toBeNull();
    });

    it("resolves both teams when the first sample omits one", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 100000,
        timeline: aFakeStrongholdsTimelineWith({
          events: [
            { timestampMs: 10000, runningScores: { "0": 5 } },
            { timestampMs: 40000, runningScores: { "0": 20, "1": 8 } },
          ],
        }),
      });
      const result = asStrongholdsScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.teamLines.map((line) => line.teamId)).toEqual([0, 1]);
    });

    it("builds a linear score delta for continuous zone scoring", () => {
      const data = aFakeScoreProgressionWith({ durationMs: 100000, timeline: aFakeStrongholdsTimelineWith() });
      const result = asStrongholdsScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.scoreDelta?.lineType).toBe("linear");
    });

    it("builds ramp team lines with one point per event and no step duplication", () => {
      const data = aFakeScoreProgressionWith({ durationMs: 100000, timeline: aFakeStrongholdsTimelineWith() });
      const result = asStrongholdsScoreLines(formatScoreProgression(data, TEAM_COLORS));
      const [team0] = result.teamLines;
      // origin + 4 events + extension to match duration
      expect(team0.points).toEqual([
        { timestampMs: 0, score: 0 },
        { timestampMs: 10000, score: 0 },
        { timestampMs: 40000, score: 30 },
        { timestampMs: 60000, score: 30 },
        { timestampMs: 90000, score: 60 },
        { timestampMs: 100000, score: 60 },
      ]);
    });

    it("builds a player advantage overlay from the death timeline", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 100000,
        timeline: aFakeStrongholdsTimelineWith({
          deathTimeline: [{ timestampMs: 20000, teamId: 1 }],
          respawnDurationMs: 8000,
        }),
      });
      const result = asStrongholdsScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.scoreDelta).not.toBeNull();
      expect(result.playerAdvantage?.points).toEqual([
        { timestampMs: 0, score: 0 },
        { timestampMs: 20000, score: 1 },
        { timestampMs: 28000, score: 0 },
        { timestampMs: 100000, score: 0 },
      ]);
    });

    it("returns null player advantage when the respawn duration is unknown", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 100000,
        timeline: aFakeStrongholdsTimelineWith({ respawnDurationMs: null }),
      });
      const result = asStrongholdsScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.playerAdvantage).toBeNull();
    });

    it("builds capture and secure markers on the team lines", () => {
      const data = aFakeScoreProgressionWith({ durationMs: 100000, timeline: aFakeStrongholdsTimelineWith() });
      const result = asStrongholdsScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.markers?.map((marker) => [marker.timestampMs, marker.teamId, marker.kind])).toEqual([
        [10000, 0, "capture"],
        [40000, 1, "capture"],
        [60000, 0, "capture"],
        [70000, 0, "secure"],
      ]);
    });

    it("builds a zone advantage overlay from the zone timeline", () => {
      const data = aFakeScoreProgressionWith({ durationMs: 100000, timeline: aFakeStrongholdsTimelineWith() });
      const result = asStrongholdsScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.zoneAdvantage?.points.at(0)).toEqual({ timestampMs: 0, score: 0 });
      expect(result.zoneAdvantage?.points.at(-1)).toEqual({ timestampMs: 100000, score: 1 });
      expect(result.zoneAdvantage?.minScore).toBe(-3);
      expect(result.zoneAdvantage?.maxScore).toBe(3);
    });
  });

  describe("kill-race overlays", () => {
    it("returns null markers and zone advantage for kill-race timelines", () => {
      const data = aFakeScoreProgressionWith({
        durationMs: 30000,
        timeline: {
          type: "kill-race",
          events: [{ timestampMs: 5000, teamId: 0, runningScores: { "0": 1, "1": 0 } }],
          deathTimeline: [],
          respawnDurationMs: 8000,
        },
      });
      const result = asScoreLines(formatScoreProgression(data, TEAM_COLORS));
      expect(result.markers).toBeNull();
      expect(result.zoneAdvantage).toBeNull();
    });
  });
});

describe("formatScoreProgression ctf", () => {
  function aCtfProgression(timeline = aFakeCtfTimelineWith()): NonNullable<MatchAnalytics["scoreProgression"]> {
    return aFakeScoreProgressionWith({ mode: 15, durationMs: 120000, timeline });
  }

  it("builds flag runs in team colours and a capture step score line", () => {
    const result = asCtf(formatScoreProgression(aCtfProgression(), TEAM_COLORS));

    expect(result.durationMs).toBe(120000);
    expect(result.runs.map((run) => [run.seriesName, run.color])).toEqual([
      ["Eagle flag · Cobra carrying", "#ff0000"],
      ["Cobra flag · Eagle carrying", "#0000ff"],
    ]);
    expect(result.legend.map((entry) => entry.key)).toEqual(["flag-0", "flag-1"]);
    const { scoreLines } = result;
    expect(scoreLines?.teamLines.map((line) => line.points.at(-1)?.score)).toEqual([0, 1]);
    expect(scoreLines?.playerAdvantage).not.toBeNull();
  });

  it("exposes the advantage overlay rows and the ordered team names on the flag view", () => {
    const result = asCtf(formatScoreProgression(aCtfProgression(), TEAM_COLORS, 4));

    expect(result.teamNames).toEqual(["Eagle", "Cobra"]);
    expect(result.advantageOverlay?.minScore).toBe(-4);
    expect(result.advantageOverlay?.maxScore).toBe(4);
    expect(result.advantageOverlay?.rows.map((row) => [row.timestampMs, row.playerAdvantage])).toEqual([
      [0, 0],
      [20000, 0],
      [30000, 0],
      [40000, -1],
      [45000, -1],
      [48000, 0],
      [60000, 0],
      [70000, 0],
      [80000, 0],
      [90000, -1],
      [98000, 0],
      [100000, 0],
      [120000, 0],
    ]);
    expect(result.advantageOverlay?.rows[3]?.run1).toBe(25 + (10000 / 15000) * 35);
  });

  it("keeps the advantage overlay on the flag view when nobody captured", () => {
    const result = asCtf(formatScoreProgression(aCtfProgression(aFakeCtfTimelineWith({ events: [] })), TEAM_COLORS));

    expect(result.scoreLines).toBeNull();
    expect(result.advantageOverlay).not.toBeNull();
  });

  it("offers no advantage overlay on the flag view without a respawn duration", () => {
    const timeline = aFakeCtfTimelineWith({ respawnDurationMs: null });
    const result = asCtf(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS));

    expect(result.advantageOverlay).toBeNull();
  });

  it("offers no score line when nobody captured but still resolves the teams from the runs", () => {
    const result = asCtf(formatScoreProgression(aCtfProgression(aFakeCtfTimelineWith({ events: [] })), TEAM_COLORS));

    expect(result.scoreLines).toBeNull();
    expect(result.runs).toHaveLength(2);
  });

  it("clamps a capture stamped past the match duration onto the score line's end", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [{ timestampMs: 120040, teamId: 1, runningScores: { "0": 0, "1": 1 } }],
    });
    const result = asCtf(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS));
    const cobra = result.scoreLines?.teamLines.find((line) => line.teamId === 1);
    expect(cobra?.points.at(-1)).toEqual({ timestampMs: 120000, score: 1 });
  });

  it("drops a capture stamped well past the match duration from the score line", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [
        { timestampMs: 60000, teamId: 1, runningScores: { "0": 0, "1": 1 } },
        { timestampMs: 300000, teamId: 1, runningScores: { "0": 0, "1": 2 } },
      ],
    });
    const result = asCtf(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS));
    const cobra = result.scoreLines?.teamLines.find((line) => line.teamId === 1);
    expect(cobra?.points.at(-1)).toEqual({ timestampMs: 120000, score: 1 });
  });

  it("rejects a capture beyond the match-end tolerance from both the score line and the run", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [{ timestampMs: 121500, teamId: 1, runningScores: { "0": 0, "1": 1 } }],
      runs: [
        aFakeCtfFlagRunWith({
          startMs: 100000,
          endMs: 121500,
          samples: [{ timestampMs: 110000, progress: 0.4 }],
          events: [{ timestampMs: 121500, kind: "capture" }],
        }),
      ],
    });
    const result = asCtf(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS));
    expect(result.scoreLines).toBeNull();
    expect(result.runs[0].reset).toBeNull();
    expect(result.runs[0].markers).toEqual([]);
  });

  it("ignores a capture beyond the match-end tolerance when resolving the teams", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [
        { timestampMs: 60000, teamId: 1, runningScores: { "0": 0, "1": 1 } },
        { timestampMs: 300000, teamId: 2, runningScores: { "0": 0, "1": 1, "2": 1 } },
      ],
    });
    const result = asCtf(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS));
    expect(result.runs).toHaveLength(2);
    expect(result.legend.map((entry) => entry.key)).toEqual(["flag-0", "flag-1"]);
  });

  it("exposes the shared chart rows alongside the runs, without the advantage stepped in", () => {
    const result = asCtf(formatScoreProgression(aCtfProgression(), TEAM_COLORS));
    expect(result.points.at(0)).toEqual({ timestampMs: 20000, run1: 0, run2: null });
    expect(result.points).toHaveLength(8);
  });

  it("falls back to the capture score lines when no run can be drawn", () => {
    const timeline = aFakeCtfTimelineWith({ runs: [] });
    const result = formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS);
    expect(result?.kind).toBe("score-lines");
  });

  it("falls back to the capture score lines when the captures, runs and deaths name a single team", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [{ timestampMs: 60000, teamId: 1, runningScores: { "1": 1 } }],
      runs: [],
      deathTimeline: [{ timestampMs: 40000, teamId: 1 }],
    });
    const result = formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS);
    expect(result?.kind).toBe("score-lines");
  });

  it("falls back to the capture score lines when the records carry more than two teams", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [{ timestampMs: 60000, teamId: 1, runningScores: { "0": 0, "1": 1, "2": 0 } }],
    });
    const result = formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS);
    expect(result?.kind).toBe("score-lines");
  });

  it("completes the roster from the runs when a sparse capture record names only the scorer", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [{ timestampMs: 60000, teamId: 1, runningScores: { "1": 1 } }],
    });
    const result = asCtf(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS));
    expect(result.runs).toHaveLength(2);
    expect(result.scoreLines?.teamLines.map((line) => line.teamId)).toEqual([0, 1]);
  });

  it("resolves the teams from the captures even when a run names a team outside the match", () => {
    const timeline = aFakeCtfTimelineWith({
      runs: [...aFakeCtfTimelineWith().runs, aFakeCtfFlagRunWith({ carrierTeamId: 3 })],
    });
    const result = asCtf(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS));
    expect(result.runs).toHaveLength(2);
    expect(result.scoreLines?.teamLines.map((line) => line.teamId)).toEqual([0, 1]);
  });

  it("ignores run teams once the captures already name two teams", () => {
    const malformed = aFakeCtfFlagRunWith({ carrierTeamId: 5 });
    const timeline = aFakeCtfTimelineWith({
      events: [{ timestampMs: 60000, teamId: 1, runningScores: { "0": 0, "1": 1 } }],
      runs: [aFakeCtfFlagRunWith(), malformed, malformed],
    });
    const result = asCtf(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS));
    expect(result.runs).toHaveLength(1);
    expect(result.legend.map((entry) => entry.key)).toEqual(["flag-0", "flag-1"]);
  });

  it("ignores a same-team run when inferring the roster of a 0-0 match", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [],
      runs: [aFakeCtfFlagRunWith(), aFakeCtfFlagRunWith({ flagTeamId: 2, carrierTeamId: 2 })],
    });
    const result = asCtf(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS));
    expect(result.runs).toHaveLength(1);
    expect(result.legend.map((entry) => entry.key)).toEqual(["flag-0", "flag-1"]);
  });

  it("keeps the valid runs of a 0-0 match when one run names a team outside it", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [],
      runs: [...aFakeCtfTimelineWith().runs, aFakeCtfFlagRunWith({ carrierTeamId: 3 })],
    });
    const result = asCtf(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS));
    expect(result.runs).toHaveLength(2);
    expect(result.scoreLines).toBeNull();
  });

  it("shows an empty flag chart resolved from the deaths when the timeline has neither captures nor runs", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [],
      runs: [],
      deathTimeline: [
        { timestampMs: 40000, teamId: 1 },
        { timestampMs: 50000, teamId: 0 },
        { timestampMs: 90000, teamId: 1 },
      ],
    });
    const result = asCtf(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS, 4));

    expect(result.runs).toEqual([]);
    expect(result.points).toEqual([{ timestampMs: 0 }, { timestampMs: 120000 }]);
    expect(result.legend.map((entry) => entry.key)).toEqual(["flag-0", "flag-1"]);
    expect(result.teamNames).toEqual(["Eagle", "Cobra"]);
    expect(result.scoreLines).toBeNull();
    expect(result.advantageOverlay?.rows.map((row) => row.playerAdvantage)).toEqual([0, 1, 0, -1, 0, 1, 0, 0]);
  });

  it("completes a one-team capture record from the deaths and still draws the capture score lines", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [{ timestampMs: 60000, teamId: 1, runningScores: { "1": 1 } }],
      runs: [],
      deathTimeline: [{ timestampMs: 40000, teamId: 0 }],
    });
    const result = asScoreLines(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS));

    expect(result.teamLines.map((line) => line.name)).toEqual(["Eagle", "Cobra"]);
  });

  it("trusts the deaths over a decoded run when both could name the missing team", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [{ timestampMs: 60000, teamId: 1, runningScores: { "1": 1 } }],
      runs: [aFakeCtfFlagRunWith({ flagTeamId: 1, carrierTeamId: 2 })],
      deathTimeline: [{ timestampMs: 40000, teamId: 0 }],
    });
    const result = asScoreLines(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS));

    expect(result.teamLines.map((line) => line.name)).toEqual(["Eagle", "Cobra"]);
  });

  it("lets no run past the match end vouch for a team", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [{ timestampMs: 60000, teamId: 1, runningScores: { "1": 1 } }],
      runs: [aFakeCtfFlagRunWith({ flagTeamId: 2, carrierTeamId: 1, startMs: 125000, endMs: 130000 })],
      deathTimeline: [{ timestampMs: 40000, teamId: 0 }],
    });
    const result = asScoreLines(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS));

    expect(result.teamLines.map((line) => line.name)).toEqual(["Eagle", "Cobra"]);
  });

  it("shows the empty flag chart without an overlay when the decode is empty and no respawn duration is known", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [],
      runs: [],
      respawnDurationMs: null,
      deathTimeline: [
        { timestampMs: 40000, teamId: 1 },
        { timestampMs: 50000, teamId: 0 },
      ],
    });
    const result = asCtf(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS, 4));

    expect(result.runs).toEqual([]);
    expect(result.advantageOverlay).toBeNull();
    expect(result.scoreLines).toBeNull();
  });

  it("ignores deaths stamped after the match when the deaths name the teams", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [],
      runs: [],
      deathTimeline: [
        { timestampMs: 40000, teamId: 1 },
        { timestampMs: 50000, teamId: 0 },
        { timestampMs: 130000, teamId: 2 },
        { timestampMs: 131000, teamId: 2 },
        { timestampMs: 132000, teamId: 2 },
      ],
    });
    const result = asCtf(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS));

    expect(result.teamNames).toEqual(["Eagle", "Cobra"]);
  });

  it("returns null when the only capture was dropped as bad data and nothing else was decoded", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [{ timestampMs: 200000, teamId: 1, runningScores: { "0": 0, "1": 1 } }],
      runs: [],
      deathTimeline: [
        { timestampMs: 40000, teamId: 1 },
        { timestampMs: 50000, teamId: 0 },
      ],
    });

    expect(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS)).toBeNull();
  });

  it("returns null when nobody captured and every decoded run had to be rejected", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [],
      runs: [aFakeCtfFlagRunWith({ startMs: 125000, endMs: 130000 })],
      deathTimeline: [
        { timestampMs: 40000, teamId: 1 },
        { timestampMs: 50000, teamId: 0 },
      ],
    });

    expect(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS)).toBeNull();
  });

  it("does not let the deaths name a roster for a match with more than two teams", () => {
    const timeline = aFakeCtfTimelineWith({
      events: [],
      runs: [],
      deathTimeline: [
        { timestampMs: 40000, teamId: 1 },
        { timestampMs: 50000, teamId: 0 },
        { timestampMs: 60000, teamId: 2 },
      ],
    });
    const data = aFakeScoreProgressionWith({ mode: 15, durationMs: 120000, timeline, teamCount: 3 });

    expect(formatScoreProgression(data, TEAM_COLORS)).toBeNull();
  });

  it("returns null when the timeline has no captures, runs or deaths to name the teams", () => {
    expect(
      formatScoreProgression(
        aCtfProgression(aFakeCtfTimelineWith({ events: [], runs: [], deathTimeline: [] })),
        TEAM_COLORS,
      ),
    ).toBeNull();
  });

  it("returns null when only one team ever died and nothing else names the roster", () => {
    const timeline = aFakeCtfTimelineWith({ events: [], runs: [], deathTimeline: [{ timestampMs: 40000, teamId: 1 }] });

    expect(formatScoreProgression(aCtfProgression(timeline), TEAM_COLORS)).toBeNull();
  });
});
