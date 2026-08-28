import { describe, expect, it } from "vitest";
import { buildOddballRounds } from "../oddball-view-model";
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

  it("clips carry segments overrunning the round bounds", () => {
    const rounds = buildOddballRounds(aFakeOddballTimelineWith(), TEAM_IDS, TEAM_COLORS);
    expect(rounds[1]?.segments).toEqual([{ startMs: 342000, endMs: 460000, teamId: 1, color: "#ff0000" }]);
  });

  it("drops a carry segment entirely outside the round bounds", () => {
    const timeline = aFakeOddballTimelineWith();
    const [firstRound] = timeline.rounds;
    const rounds = buildOddballRounds(
      aFakeOddballTimelineWith({
        rounds: [{ ...firstRound, carrySegments: [{ startMs: 340000, endMs: 345000, teamId: 0 }] }],
      }),
      TEAM_IDS,
      TEAM_COLORS,
    );
    expect(rounds[0]?.segments).toEqual([{ startMs: 0, endMs: 330000, teamId: null, color: null }]);
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
