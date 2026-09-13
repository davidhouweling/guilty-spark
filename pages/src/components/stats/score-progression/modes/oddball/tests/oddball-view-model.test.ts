import { describe, expect, it } from "vitest";
import { buildOddballRounds, buildOddballScoreSamples, buildOddballTeamLines } from "../oddball-view-model";
import { aFakeOddballTimelineWith } from "../fakes/oddball-timeline.fake";

const TEAM_IDS = [0, 1] as const;
const TEAM_COLORS = new Map<number, string>([
  [0, "#0000ff"],
  [1, "#ff0000"],
]);

describe("buildOddballRounds", () => {
  it("builds one round per timeline round with a 1-based display index", () => {
    const rounds = buildOddballRounds(aFakeOddballTimelineWith(), TEAM_IDS, TEAM_COLORS);
    expect(rounds.map((r) => r.roundIndex)).toEqual([1, 2]);
  });

  it("maps ending and winner onto the round data", () => {
    const rounds = buildOddballRounds(aFakeOddballTimelineWith(), TEAM_IDS, TEAM_COLORS);
    expect(rounds[0]).toMatchObject({ endedByCap: false, winnerColor: "#0000ff", winnerName: "Eagle" });
    expect(rounds[1]).toMatchObject({ endedByCap: true, winnerColor: "#ff0000", winnerName: "Cobra" });
  });

  it("maps team scores in team-id order with names and colors", () => {
    const rounds = buildOddballRounds(aFakeOddballTimelineWith(), TEAM_IDS, TEAM_COLORS);
    expect(rounds[0]?.teamScores).toEqual([
      { teamId: 0, name: "Eagle", color: "#0000ff", score: 20 },
      { teamId: 1, name: "Cobra", color: "#ff0000", score: 10 },
    ]);
  });

  it("colors carry segments by team and fills gaps and round bounds with unoccupied segments", () => {
    const rounds = buildOddballRounds(aFakeOddballTimelineWith(), TEAM_IDS, TEAM_COLORS);
    expect(rounds[0]?.segments).toEqual([
      { startMs: 0, endMs: 5000, teamId: null, color: null },
      { startMs: 5000, endMs: 20000, teamId: 0, color: "#0000ff" },
      { startMs: 20000, endMs: 25000, teamId: null, color: null },
      { startMs: 25000, endMs: 30000, teamId: 0, color: "#0000ff" },
      { startMs: 30000, endMs: 40000, teamId: null, color: null },
      { startMs: 40000, endMs: 50000, teamId: 1, color: "#ff0000" },
      { startMs: 50000, endMs: 330000, teamId: null, color: null },
    ]);
  });

  it("segments tile each round without gaps or overlaps", () => {
    const rounds = buildOddballRounds(aFakeOddballTimelineWith(), TEAM_IDS, TEAM_COLORS);
    const segments = rounds[0]?.segments ?? [];
    expect(segments.slice(1).map((s) => s.startMs)).toEqual(segments.slice(0, -1).map((s) => s.endMs));
  });

  it("tiles a capped round from its carry segment to the round bounds", () => {
    const rounds = buildOddballRounds(aFakeOddballTimelineWith(), TEAM_IDS, TEAM_COLORS);
    expect(rounds[1]?.segments).toEqual([
      { startMs: 342000, endMs: 345000, teamId: null, color: null },
      { startMs: 345000, endMs: 460000, teamId: 1, color: "#ff0000" },
    ]);
  });

  it("builds an empty rounds list for a timeline with no rounds", () => {
    expect(buildOddballRounds(aFakeOddballTimelineWith({ rounds: [] }), TEAM_IDS, TEAM_COLORS)).toEqual([]);
  });

  it("falls back to a null segment color for a team missing from the color map", () => {
    const rounds = buildOddballRounds(aFakeOddballTimelineWith(), TEAM_IDS, new Map());
    const occupied = rounds[0]?.segments.find((s) => s.teamId != null);
    expect(occupied?.color).toBeNull();
  });
});

describe("buildOddballScoreSamples", () => {
  it("ramps each team through its carry segments and holds flat between them", () => {
    const samples = buildOddballScoreSamples(aFakeOddballTimelineWith(), [...TEAM_IDS], 470000);
    const at = (timestampMs: number): Record<string, number> | undefined =>
      samples.find((sample) => sample.timestampMs === timestampMs)?.runningScores;
    expect(at(5000)).toEqual({ "0": 0, "1": 0 });
    expect(at(20000)).toEqual({ "0": 15, "1": 0 });
    expect(at(30000)).toEqual({ "0": 20, "1": 0 });
    expect(at(50000)).toEqual({ "0": 20, "1": 10 });
    expect(at(330000)).toEqual({ "0": 20, "1": 10 });
  });

  it("carries the previous round's totals to the next round start and then resets to zero", () => {
    const samples = buildOddballScoreSamples(aFakeOddballTimelineWith(), [...TEAM_IDS], 470000);
    const atRoundTwoStart = samples.filter((sample) => sample.timestampMs === 342000);
    expect(atRoundTwoStart).toEqual([
      { timestampMs: 342000, runningScores: { "0": 20, "1": 10 } },
      { timestampMs: 342000, runningScores: { "0": 0, "1": 0 } },
    ]);
  });

  it("scales a round's carry so the final value lands exactly on the API round score", () => {
    // round 2: 115 carried seconds against a 100-point round score
    const samples = buildOddballScoreSamples(aFakeOddballTimelineWith(), [...TEAM_IDS], 470000);
    const last = samples.at(-1);
    expect(last).toEqual({ timestampMs: 460000, runningScores: { "0": 0, "1": 100 } });
  });

  it("falls back to a uniform ramp for a team with a round score but no carry segments", () => {
    const timeline = aFakeOddballTimelineWith({
      rounds: [
        {
          roundIndex: 0,
          startMs: 0,
          endMs: 100000,
          endedByCap: false,
          winnerTeamId: 0,
          scores: { "0": 50, "1": 0 },
          carrySegments: [],
        },
      ],
    });
    const samples = buildOddballScoreSamples(timeline, [...TEAM_IDS], 100000);
    expect(samples).toEqual([
      { timestampMs: 0, runningScores: { "0": 0, "1": 0 } },
      { timestampMs: 100000, runningScores: { "0": 50, "1": 0 } },
    ]);
  });

  it("skips rounds entirely past the match duration and clamps segments to it", () => {
    const samples = buildOddballScoreSamples(aFakeOddballTimelineWith(), [...TEAM_IDS], 330000);
    expect(samples.at(-1)?.timestampMs).toBe(330000);
  });
});

describe("buildOddballTeamLines", () => {
  it("builds reset ramp lines from the samples with an origin and duration extension", () => {
    const samples = buildOddballScoreSamples(aFakeOddballTimelineWith(), [...TEAM_IDS], 470000);
    const lines = buildOddballTeamLines(samples, [...TEAM_IDS], TEAM_COLORS, 470000);
    const [team0, team1] = lines;
    expect(team0.name).toBe("Eagle");
    expect(team0.points.at(0)).toEqual({ timestampMs: 0, score: 0 });
    // vertical drop at the round-two reset
    expect(team0.points.filter((point) => point.timestampMs === 342000)).toEqual([
      { timestampMs: 342000, score: 20 },
      { timestampMs: 342000, score: 0 },
    ]);
    expect(team1.points.at(-1)).toEqual({ timestampMs: 470000, score: 100 });
  });
});
