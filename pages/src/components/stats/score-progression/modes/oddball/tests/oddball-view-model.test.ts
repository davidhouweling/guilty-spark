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

  it("maps round bounds, ending, and winner onto the round data", () => {
    const rounds = buildOddballRounds(aFakeOddballTimelineWith(), TEAM_IDS, TEAM_COLORS);
    expect(rounds[0]).toMatchObject({
      startMs: 0,
      endMs: 330000,
      endedByCap: false,
      winnerTeamId: 0,
      winnerColor: "#0000ff",
      winnerName: "Eagle",
    });
    expect(rounds[1]).toMatchObject({
      startMs: 342000,
      endMs: 460000,
      endedByCap: true,
      winnerTeamId: 1,
      winnerColor: "#ff0000",
      winnerName: "Cobra",
    });
  });

  it("maps team scores in team-id order with names and colors", () => {
    const rounds = buildOddballRounds(aFakeOddballTimelineWith(), TEAM_IDS, TEAM_COLORS);
    expect(rounds[0]?.teamScores).toEqual([
      { teamId: 0, name: "Eagle", color: "#0000ff", score: 20 },
      { teamId: 1, name: "Cobra", color: "#ff0000", score: 10 },
    ]);
  });

  it("groups consecutive same-team carry events within one crossing gap into a single segment", () => {
    const rounds = buildOddballRounds(aFakeOddballTimelineWith(), TEAM_IDS, TEAM_COLORS);
    const team0Segments = rounds[0]?.segments.filter((s) => s.teamId === 0) ?? [];
    // events at 10000..20000 chain (gaps 5000); the 20000→30000 gap exceeds one crossing,
    // so the last event starts its own burst
    expect(team0Segments).toEqual([
      { startMs: 5000, endMs: 20000, teamId: 0, color: "#0000ff" },
      { startMs: 25000, endMs: 30000, teamId: 0, color: "#0000ff" },
    ]);
  });

  it("splits bursts when possession changes team", () => {
    const rounds = buildOddballRounds(aFakeOddballTimelineWith(), TEAM_IDS, TEAM_COLORS);
    const occupiedTeamIds = rounds[0]?.segments.filter((s) => s.teamId != null).map((s) => s.teamId) ?? [];
    expect(occupiedTeamIds).toEqual([0, 0, 1]);
  });

  it("fills gaps between bursts and round bounds with unoccupied segments", () => {
    const rounds = buildOddballRounds(aFakeOddballTimelineWith(), TEAM_IDS, TEAM_COLORS);
    const segments = rounds[0]?.segments ?? [];
    expect(segments[0]).toEqual({ startMs: 0, endMs: 5000, teamId: null, color: null });
    expect(segments.at(-1)).toEqual({ startMs: 50000, endMs: 330000, teamId: null, color: null });
    // segments tile the round without gaps or overlaps
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i]?.startMs).toBe(segments[i - 1]?.endMs);
    }
  });

  it("clamps the first burst's lead-in to the round start", () => {
    const [, cappedRound] = aFakeOddballTimelineWith().rounds;
    const rounds = buildOddballRounds(aFakeOddballTimelineWith({ rounds: [cappedRound] }), TEAM_IDS, TEAM_COLORS);
    const [firstSegment] = rounds[0]?.segments ?? [];
    expect(firstSegment.teamId).toBeNull();
    expect(firstSegment.startMs).toBe(342000);
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
