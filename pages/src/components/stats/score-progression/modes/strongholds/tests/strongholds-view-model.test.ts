import { describe, expect, it } from "vitest";
import { buildStrongholdsMarkers, buildStrongholdsTeamLines, buildZoneAdvantage } from "../strongholds-view-model";
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

describe("buildStrongholdsMarkers", () => {
  it("places each zone event on its team's line, interpolating between ramp points", () => {
    const timeline = aFakeStrongholdsTimelineWith();
    const teamLines = buildStrongholdsTeamLines(timeline.events, TEAM_IDS, TEAM_COLORS, 100000);
    const markers = buildStrongholdsMarkers(timeline.zoneEvents, teamLines, 100000);
    expect(markers).toEqual([
      {
        timestampMs: 10000,
        score: 0,
        teamId: 0,
        teamName: "Eagle",
        color: "#0000ff",
        kind: "capture",
        label: "Eagle captured a zone · 0:10",
      },
      {
        timestampMs: 40000,
        score: 0,
        teamId: 1,
        teamName: "Cobra",
        color: "#ff0000",
        kind: "capture",
        label: "Cobra captured a zone · 0:40",
      },
      {
        timestampMs: 60000,
        score: 30,
        teamId: 0,
        teamName: "Eagle",
        color: "#0000ff",
        kind: "capture",
        label: "Eagle captured a zone · 1:00",
      },
      // 70s sits a third of the way along the 60s→90s ramp from 30 to 60
      {
        timestampMs: 70000,
        score: 40,
        teamId: 0,
        teamName: "Eagle",
        color: "#0000ff",
        kind: "secure",
        label: "Eagle secured a zone · 1:10",
      },
    ]);
  });

  it("drops zone events past the match duration or for unknown teams", () => {
    const timeline = aFakeStrongholdsTimelineWith();
    const teamLines = buildStrongholdsTeamLines(timeline.events, TEAM_IDS, TEAM_COLORS, 100000);
    const markers = buildStrongholdsMarkers(
      [
        { timestampMs: 150000, teamId: 0, kind: "capture" },
        { timestampMs: 20000, teamId: 5, kind: "capture" },
        { timestampMs: 20000, teamId: 1, kind: "secure" },
      ],
      teamLines,
      100000,
    );
    expect(markers).toEqual([
      {
        timestampMs: 20000,
        score: 0,
        teamId: 1,
        teamName: "Cobra",
        color: "#ff0000",
        kind: "secure",
        label: "Cobra secured a zone · 0:20",
      },
    ]);
  });
});

describe("buildZoneAdvantage", () => {
  it("builds a step series of the zone-count difference extended to the match duration", () => {
    const timeline = aFakeStrongholdsTimelineWith();
    const zoneAdvantage = buildZoneAdvantage(timeline.zoneTimeline, [...TEAM_IDS], 100000);
    expect(zoneAdvantage).toEqual({
      points: [
        { timestampMs: 0, score: 0 },
        { timestampMs: 10000, score: 1 },
        { timestampMs: 40000, score: -1 },
        { timestampMs: 60000, score: 1 },
        { timestampMs: 100000, score: 1 },
      ],
      minScore: -3,
      maxScore: 3,
    });
  });

  it("drops samples past the match duration", () => {
    const zoneAdvantage = buildZoneAdvantage(
      [
        { timestampMs: 0, zoneCounts: { "0": 1, "1": 1 } },
        { timestampMs: 10000, zoneCounts: { "0": 2, "1": 1 } },
        { timestampMs: 150000, zoneCounts: { "0": 3, "1": 0 } },
      ],
      [...TEAM_IDS],
      100000,
    );
    expect(zoneAdvantage?.points).toEqual([
      { timestampMs: 0, score: 0 },
      { timestampMs: 10000, score: 1 },
      { timestampMs: 100000, score: 1 },
    ]);
  });

  it("seeds an even baseline at t=0 when the zone timeline starts later", () => {
    const zoneAdvantage = buildZoneAdvantage(
      [{ timestampMs: 15000, zoneCounts: { "0": 2, "1": 1 } }],
      [...TEAM_IDS],
      100000,
    );
    expect(zoneAdvantage?.points).toEqual([
      { timestampMs: 0, score: 0 },
      { timestampMs: 15000, score: 1 },
      { timestampMs: 100000, score: 1 },
    ]);
  });

  it("returns null when the timeline is empty or the counts never diverge", () => {
    expect(buildZoneAdvantage([], [...TEAM_IDS], 100000)).toBeNull();
    expect(buildZoneAdvantage([{ timestampMs: 0, zoneCounts: { "0": 1, "1": 1 } }], [...TEAM_IDS], 100000)).toBeNull();
  });

  it("returns null when the match is not a two-team match", () => {
    expect(buildZoneAdvantage([{ timestampMs: 0, zoneCounts: { "0": 1 } }], [0], 100000)).toBeNull();
  });
});
