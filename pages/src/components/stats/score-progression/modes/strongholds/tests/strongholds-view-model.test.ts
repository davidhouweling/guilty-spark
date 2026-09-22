import { describe, expect, it } from "vitest";
import { buildSampledTeamLines } from "../../../sampled-team-lines";
import {
  buildStrongholdsMarkers,
  buildZoneAdvantage,
  buildZoneControlStrip,
  buildZoneCountWindows,
} from "../strongholds-view-model";
import { aFakeStrongholdsTimelineWith } from "../fakes/strongholds-timeline.fake";
import { aFakeTeamLineWith } from "../../../fakes/team-line.fake";

const TEAM_IDS = [0, 1] as const;
const TEAM_COLORS = new Map<number, string>([
  [0, "#0000ff"],
  [1, "#ff0000"],
]);

describe("buildStrongholdsMarkers", () => {
  it("places each zone event on its team's line, interpolating between ramp points", () => {
    const timeline = aFakeStrongholdsTimelineWith();
    const teamLines = buildSampledTeamLines(timeline.events, TEAM_IDS, TEAM_COLORS, 100000);
    const markers = buildStrongholdsMarkers(timeline.zoneEvents, teamLines, 100000);
    expect(markers).toEqual([
      { timestampMs: 10000, score: 0, teamId: 0, teamName: "Eagle", color: "#0000ff", kind: "capture" },
      { timestampMs: 40000, score: 0, teamId: 1, teamName: "Cobra", color: "#ff0000", kind: "capture" },
      { timestampMs: 60000, score: 30, teamId: 0, teamName: "Eagle", color: "#0000ff", kind: "capture" },
      // 70s sits a third of the way along the 60s→90s ramp from 30 to 60
      { timestampMs: 70000, score: 40, teamId: 0, teamName: "Eagle", color: "#0000ff", kind: "secure" },
    ]);
  });

  it("drops zone events past the match duration or for unknown teams", () => {
    const timeline = aFakeStrongholdsTimelineWith();
    const teamLines = buildSampledTeamLines(timeline.events, TEAM_IDS, TEAM_COLORS, 100000);
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
      { timestampMs: 20000, score: 0, teamId: 1, teamName: "Cobra", color: "#ff0000", kind: "secure" },
    ]);
  });
});

describe("buildZoneAdvantage", () => {
  it("builds a step series of the zone-count difference extended to the match duration", () => {
    const timeline = aFakeStrongholdsTimelineWith();
    const zoneAdvantage = buildZoneAdvantage(
      buildZoneCountWindows(timeline.zoneTimeline, [...TEAM_IDS], 100000),
      100000,
    );
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
      buildZoneCountWindows(
        [
          { timestampMs: 0, zoneCounts: { "0": 1, "1": 1 } },
          { timestampMs: 10000, zoneCounts: { "0": 2, "1": 1 } },
          { timestampMs: 150000, zoneCounts: { "0": 3, "1": 0 } },
        ],
        [...TEAM_IDS],
        100000,
      ),
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
      buildZoneCountWindows([{ timestampMs: 15000, zoneCounts: { "0": 2, "1": 1 } }], [...TEAM_IDS], 100000),
      100000,
    );
    expect(zoneAdvantage?.points).toEqual([
      { timestampMs: 0, score: 0 },
      { timestampMs: 15000, score: 1 },
      { timestampMs: 100000, score: 1 },
    ]);
  });

  it("returns null when the timeline is empty or the counts never diverge", () => {
    expect(buildZoneAdvantage(buildZoneCountWindows([], [...TEAM_IDS], 100000), 100000)).toBeNull();
    expect(
      buildZoneAdvantage(
        buildZoneCountWindows([{ timestampMs: 0, zoneCounts: { "0": 1, "1": 1 } }], [...TEAM_IDS], 100000),
        100000,
      ),
    ).toBeNull();
  });

  it("returns null when the only divergence is a zero-width window, matching the zone strip", () => {
    const windows = buildZoneCountWindows(
      [
        { timestampMs: 0, zoneCounts: { "0": 1, "1": 1 } },
        { timestampMs: 100000, zoneCounts: { "0": 2, "1": 1 } },
      ],
      [...TEAM_IDS],
      100000,
    );
    expect(buildZoneAdvantage(windows, 100000)).toBeNull();
  });

  it("returns null when the match is not a two-team match", () => {
    expect(
      buildZoneAdvantage(buildZoneCountWindows([{ timestampMs: 0, zoneCounts: { "0": 1 } }], [0], 100000), 100000),
    ).toBeNull();
  });
});

describe("buildZoneControlStrip", () => {
  const TEAM_LINES = [aFakeTeamLineWith(), aFakeTeamLineWith({ teamId: 1, name: "Cobra", color: "#ff0000" })];

  it("colors each window by the leading team with opacity from their zone count", () => {
    const strip = buildZoneControlStrip(
      buildZoneCountWindows(aFakeStrongholdsTimelineWith().zoneTimeline, [0, 1], 100000),
      TEAM_LINES,
      100000,
    );
    expect(strip?.segments).toEqual([
      { startMs: 0, endMs: 10000, teamId: null, color: null },
      { startMs: 10000, endMs: 40000, teamId: 0, color: "#0000ff", opacity: 0.7 },
      { startMs: 40000, endMs: 60000, teamId: 1, color: "#ff0000", opacity: 0.7 },
      { startMs: 60000, endMs: 100000, teamId: 0, color: "#0000ff", opacity: 0.7 },
    ]);
  });

  it("computes each team's share of the match spent leading", () => {
    const strip = buildZoneControlStrip(
      buildZoneCountWindows(aFakeStrongholdsTimelineWith().zoneTimeline, [0, 1], 100000),
      TEAM_LINES,
      100000,
    );
    expect(strip?.teamShares).toEqual([
      { teamId: 0, name: "Eagle", color: "#0000ff", percentage: 70 },
      { teamId: 1, name: "Cobra", color: "#ff0000", percentage: 20 },
    ]);
  });

  it("reports a lead too brief to round to 1% as 1% rather than never ahead", () => {
    const strip = buildZoneControlStrip(
      buildZoneCountWindows(
        [
          { timestampMs: 0, zoneCounts: { "0": 2, "1": 1 } },
          { timestampMs: 100, zoneCounts: { "0": 1, "1": 1 } },
        ],
        [0, 1],
        100000,
      ),
      TEAM_LINES,
      100000,
    );
    expect(strip?.teamShares[0]?.percentage).toBe(1);
  });

  it("paints a 3-cap at full opacity and a one-zone lead at the dimmest", () => {
    const strip = buildZoneControlStrip(
      buildZoneCountWindows(
        [
          { timestampMs: 0, zoneCounts: { "0": 3, "1": 0 } },
          { timestampMs: 20000, zoneCounts: { "0": 1, "1": 0 } },
        ],
        [0, 1],
        60000,
      ),
      TEAM_LINES,
      60000,
    );
    expect(strip?.segments).toEqual([
      { startMs: 0, endMs: 20000, teamId: 0, color: "#0000ff", opacity: 1 },
      { startMs: 20000, endMs: 60000, teamId: 0, color: "#0000ff", opacity: 0.4 },
    ]);
  });

  it("merges consecutive windows with the same leader and intensity", () => {
    const strip = buildZoneControlStrip(
      buildZoneCountWindows(
        [
          { timestampMs: 0, zoneCounts: { "0": 2, "1": 1 } },
          { timestampMs: 20000, zoneCounts: { "0": 2, "1": 1 } },
          { timestampMs: 30000, zoneCounts: { "0": 1, "1": 2 } },
        ],
        [0, 1],
        60000,
      ),
      TEAM_LINES,
      60000,
    );
    expect(strip?.segments).toEqual([
      { startMs: 0, endMs: 30000, teamId: 0, color: "#0000ff", opacity: 0.7 },
      { startMs: 30000, endMs: 60000, teamId: 1, color: "#ff0000", opacity: 0.7 },
    ]);
  });

  it("drops samples past the match duration and sorts out-of-order samples", () => {
    const strip = buildZoneControlStrip(
      buildZoneCountWindows(
        [
          { timestampMs: 30000, zoneCounts: { "0": 1, "1": 2 } },
          { timestampMs: 0, zoneCounts: { "0": 2, "1": 1 } },
          { timestampMs: 70000, zoneCounts: { "0": 0, "1": 3 } },
        ],
        [0, 1],
        60000,
      ),
      TEAM_LINES,
      60000,
    );
    expect(strip?.segments).toEqual([
      { startMs: 0, endMs: 30000, teamId: 0, color: "#0000ff", opacity: 0.7 },
      { startMs: 30000, endMs: 60000, teamId: 1, color: "#ff0000", opacity: 0.7 },
    ]);
  });

  it("returns null when the zone counts never diverge, matching the zone advantage", () => {
    const strip = buildZoneControlStrip(
      buildZoneCountWindows([{ timestampMs: 0, zoneCounts: { "0": 1, "1": 1 } }], [0, 1], 60000),
      TEAM_LINES,
      60000,
    );
    expect(strip).toBeNull();
  });

  it("returns null when the only divergence is a zero-width window at the match end", () => {
    const strip = buildZoneControlStrip(
      buildZoneCountWindows(
        [
          { timestampMs: 0, zoneCounts: { "0": 1, "1": 1 } },
          { timestampMs: 60000, zoneCounts: { "0": 2, "1": 1 } },
        ],
        [0, 1],
        60000,
      ),
      TEAM_LINES,
      60000,
    );
    expect(strip).toBeNull();
  });

  it("returns null without exactly two teams or without samples", () => {
    const threeLines = [...TEAM_LINES, aFakeTeamLineWith({ teamId: 2, name: "Hades", color: "#00ff00" })];
    expect(
      buildZoneControlStrip(
        buildZoneCountWindows(aFakeStrongholdsTimelineWith().zoneTimeline, [0, 1], 100000),
        threeLines,
        100000,
      ),
    ).toBeNull();
    expect(buildZoneControlStrip(buildZoneCountWindows([], [0, 1], 100000), TEAM_LINES, 100000)).toBeNull();
  });
});
