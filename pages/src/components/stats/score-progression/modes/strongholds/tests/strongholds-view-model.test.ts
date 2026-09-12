import { describe, expect, it } from "vitest";
import { buildStrongholdsTeamLines } from "../strongholds-view-model";
import { aFakeStrongholdsTimelineWith } from "../fakes/strongholds-timeline.fake";

const TEAM_IDS = [0, 1] as const;
const TEAM_COLORS = new Map<number, string>([
  [0, "#0000ff"],
  [1, "#ff0000"],
]);

describe("buildStrongholdsTeamLines", () => {
  it("builds one ramp point per event with an origin and an extension to the match duration", () => {
    const timeline = aFakeStrongholdsTimelineWith();
    const [team0] = buildStrongholdsTeamLines(timeline.events, TEAM_IDS, TEAM_COLORS, 100000);
    expect(team0.points).toEqual([
      { timestampMs: 0, score: 0 },
      { timestampMs: 10000, score: 0 },
      { timestampMs: 40000, score: 30 },
      { timestampMs: 60000, score: 30 },
      { timestampMs: 90000, score: 60 },
      { timestampMs: 100000, score: 60 },
    ]);
  });

  it("carries the previous score forward when an event omits a team", () => {
    const timeline = aFakeStrongholdsTimelineWith({
      events: [
        { timestampMs: 10000, runningScores: { "0": 5, "1": 2 } },
        { timestampMs: 20000, runningScores: { "1": 9 } },
        { timestampMs: 30000, runningScores: { "0": 12, "1": 14 } },
      ],
    });
    const [team0] = buildStrongholdsTeamLines(timeline.events, TEAM_IDS, TEAM_COLORS, 30000);
    expect(team0.points).toEqual([
      { timestampMs: 0, score: 0 },
      { timestampMs: 10000, score: 5 },
      { timestampMs: 20000, score: 5 },
      { timestampMs: 30000, score: 12 },
    ]);
  });

  it("drops samples recorded after the match duration", () => {
    const timeline = aFakeStrongholdsTimelineWith({
      events: [
        { timestampMs: 10000, runningScores: { "0": 5, "1": 2 } },
        { timestampMs: 35000, runningScores: { "0": 30, "1": 12 } },
      ],
    });
    const [team0] = buildStrongholdsTeamLines(timeline.events, TEAM_IDS, TEAM_COLORS, 30000);
    expect(team0.points).toEqual([
      { timestampMs: 0, score: 0 },
      { timestampMs: 10000, score: 5 },
      { timestampMs: 30000, score: 5 },
    ]);
  });

  it("assigns names and colors by team with slot-index fallback colors", () => {
    const timeline = aFakeStrongholdsTimelineWith();
    const lines = buildStrongholdsTeamLines(timeline.events, TEAM_IDS, new Map(), 100000);
    expect(lines[0]?.name).toBe("Eagle");
    expect(lines[1]?.name).toBe("Cobra");
    expect(lines[0]?.color).toBe("#FE3939");
    expect(lines[1]?.color).toBe("#3B9DFF");
  });
});
