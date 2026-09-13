import { describe, expect, it } from "vitest";
import { buildOddballRounds, buildOddballScoreSeries } from "../oddball-view-model";
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

describe("buildOddballScoreSeries", () => {
  it("stitches the API round points into the series with a reset at each round start", () => {
    const { samples } = buildOddballScoreSeries(aFakeOddballTimelineWith(), [...TEAM_IDS], 470000);
    const at = (timestampMs: number): Record<string, number>[] =>
      samples.filter((sample) => sample.timestampMs === timestampMs).map((sample) => sample.runningScores);
    expect(at(0)).toEqual([{ "0": 0, "1": 0 }]);
    expect(at(20000)).toEqual([{ "0": 15, "1": 0 }]);
    expect(at(50000)).toEqual([{ "0": 20, "1": 10 }]);
    // held flat to the round end
    expect(at(330000)).toEqual([{ "0": 20, "1": 10 }]);
  });

  it("carries the previous round's totals to the next round start and then resets to zero", () => {
    const { samples } = buildOddballScoreSeries(aFakeOddballTimelineWith(), [...TEAM_IDS], 470000);
    const atRoundTwoStart = samples.filter((sample) => sample.timestampMs === 342000);
    expect(atRoundTwoStart).toEqual([
      { timestampMs: 342000, runningScores: { "0": 20, "1": 10 } },
      { timestampMs: 342000, runningScores: { "0": 0, "1": 0 } },
    ]);
  });

  it("reports the boundaries of the rounds it actually emitted", () => {
    const { roundBoundaries } = buildOddballScoreSeries(aFakeOddballTimelineWith(), [...TEAM_IDS], 470000);
    expect(roundBoundaries).toEqual([342000]);
  });

  it("orders rounds by start time so boundaries and resets stay aligned for unsorted input", () => {
    const timeline = aFakeOddballTimelineWith();
    const { samples, roundBoundaries } = buildOddballScoreSeries(
      aFakeOddballTimelineWith({ rounds: [...timeline.rounds].reverse() }),
      [...TEAM_IDS],
      470000,
    );
    expect(roundBoundaries).toEqual([342000]);
    expect(samples.at(0)?.timestampMs).toBe(0);
  });

  it("drops round points past the match duration without inflating the round", () => {
    const { samples } = buildOddballScoreSeries(aFakeOddballTimelineWith(), [...TEAM_IDS], 410000);
    const last = samples.at(-1);
    // the 460000 completion point is cut; the curve holds the last in-range value to the cut
    expect(last).toEqual({ timestampMs: 410000, runningScores: { "0": 0, "1": 50 } });
  });

  it("skips rounds entirely past the match duration and emits no boundary for them", () => {
    const { samples, roundBoundaries } = buildOddballScoreSeries(aFakeOddballTimelineWith(), [...TEAM_IDS], 330000);
    expect(roundBoundaries).toEqual([]);
    expect(samples.at(-1)?.timestampMs).toBe(330000);
  });

  it("keeps the reset after a sparse round-ending sample so carried scores cannot leak across rounds", () => {
    const timeline = aFakeOddballTimelineWith();
    const [round1, round2] = timeline.rounds;
    const sparseEnding = aFakeOddballTimelineWith({
      rounds: [{ ...round1, points: [...round1.points, { timestampMs: 330000, runningScores: { "1": 10 } }] }, round2],
    });
    const { samples } = buildOddballScoreSeries(sparseEnding, [...TEAM_IDS], 470000);
    const atRoundTwoStart = samples.filter((sample) => sample.timestampMs === 342000);
    expect(atRoundTwoStart).toEqual([
      { timestampMs: 342000, runningScores: { "1": 10 } },
      { timestampMs: 342000, runningScores: { "0": 0, "1": 0 } },
    ]);
  });

  it("falls back to a uniform ramp sloped against the round's true end when a round has no points", () => {
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
          points: [],
        },
      ],
    });
    // duration cuts the round in half, so only half the round score is shown at the cut
    const { samples } = buildOddballScoreSeries(timeline, [...TEAM_IDS], 50000);
    expect(samples).toEqual([
      { timestampMs: 0, runningScores: { "0": 0, "1": 0 } },
      { timestampMs: 50000, runningScores: { "0": 25, "1": 0 } },
    ]);
  });
});
