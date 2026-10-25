import { describe, expect, it } from "vitest";
import { aFakeParsedHighlightEventWith } from "../../../fakes/parsed-highlight-event.fake";
import type { PlayerPositionTrack, Quantum3 } from "../../../positions/types";
import { aFakeCtfFlagEventWith } from "../../../statborg/fakes/ctf-flag-event.fake";
import { aFakeCtfMatchStatsWith } from "../../../statborg/fakes/ctf-match-stats.fake";
import type { CtfFlagEvent } from "../../../statborg/types";
import type { ParsedHighlightEvent } from "../../../types";
import { aFakePlayerPositionsWith, aFakeStraightLifeWith } from "../../../positions/fakes/player-positions.fake";
import { buildCtfProgression } from "../ctf-progression";
import { AUTO_RETURN_MS } from "../open-run";

// team 0 (A) defends the stand at x=1000; team 1 (B) captures at x=11000, so progress is x/10000
const A = "0100000000000000";
const B = "0400000000000000";
const STAND_0: Quantum3 = [1000, 1000, 1000];
const CAPTURE_1: Quantum3 = [11_000, 1000, 1000];
const DURATION_MS = 200_000;

function death(xuid: string, timeMs: number, teamId: number): ParsedHighlightEvent {
  return aFakeParsedHighlightEventWith({ xuid, timeMs, teamId, eventType: "death" });
}

function flag(kind: CtfFlagEvent["kind"], xuid: string, teamId: number, timestampMs: number): CtfFlagEvent {
  return aFakeCtfFlagEventWith({ kind, xuid, teamId, timestampMs });
}

function carrierTrack(lives: PlayerPositionTrack["lives"]): PlayerPositionTrack {
  return { xuid: B, teamId: 1, lives };
}

// B steals at 10 s, carries halfway by 20 s and dies; later steals at 60 s and captures at 70 s
const defaultTracks = [
  carrierTrack([
    aFakeStraightLifeWith({
      slot: 520,
      startMs: 10_000,
      endMs: 20_000,
      from: STAND_0,
      to: [6000, 1000, 1000],
      xuid: B,
    }),
    aFakeStraightLifeWith({ slot: 521, startMs: 60_000, endMs: 70_000, from: STAND_0, to: CAPTURE_1, xuid: B }),
  ]),
];
const defaultFlagEvents = [flag("steal", B, 1, 10_000), flag("steal", B, 1, 60_000), flag("capture", B, 1, 70_000)];
const defaultDeaths = [death(B, 20_000, 1)];

interface BuildOverrides {
  flagEvents?: readonly CtfFlagEvent[];
  tracks?: readonly PlayerPositionTrack[];
  highlightEvents?: readonly ParsedHighlightEvent[];
  durationMs?: number;
  feedOffsetMs?: number | null;
  unresolvedSlots?: readonly number[];
}

function build(overrides: BuildOverrides = {}): ReturnType<typeof buildCtfProgression> {
  const highlightEvents = overrides.highlightEvents ?? defaultDeaths;
  return buildCtfProgression({
    flagEvents: overrides.flagEvents ?? defaultFlagEvents,
    unresolvedSlots: overrides.unresolvedSlots ?? [],
    positions: aFakePlayerPositionsWith({
      tracks: overrides.tracks ?? defaultTracks,
      feedOffsetMs: overrides.feedOffsetMs === undefined ? 0 : overrides.feedOffsetMs,
    }),
    highlightEvents,
    matchStats: aFakeCtfMatchStatsWith(),
    durationMs: overrides.durationMs ?? DURATION_MS,
  });
}

describe("buildCtfProgression", () => {
  it("steps the score once per capture with running totals for both teams", () => {
    expect(build().events).toEqual([{ timestampMs: 70_000, teamId: 1, runningScores: { "0": 0, "1": 1 } }]);
  });

  it("auto-returns a dropped flag 25 s after the carrier died, holding the drop position", () => {
    const [run] = build().runs;

    expect(run?.outcome).toBe("autoReturn");
    expect(run?.startMs).toBe(10_000);
    expect(run?.endMs).toBe(20_000 + AUTO_RETURN_MS);
    expect(run?.events).toEqual([
      { timestampMs: 10_000, kind: "steal" },
      { timestampMs: 20_000, kind: "drop" },
    ]);
    expect(run?.samples.find((sample) => sample.timestampMs === 15_000)?.progress).toBeCloseTo(0.25, 2);
    expect(run?.samples.find((sample) => sample.timestampMs === 20_000)?.progress).toBeCloseTo(0.5, 2);
    expect(run?.samples.at(-1)).toEqual({ timestampMs: 45_000, progress: 0.5 });
  });

  it("closes a captured run at full progress with the capture as its last event", () => {
    const [, run] = build().runs;

    expect(run?.outcome).toBe("capture");
    expect(run?.flagTeamId).toBe(0);
    expect(run?.carrierTeamId).toBe(1);
    expect(run?.events.at(-1)).toEqual({ timestampMs: 70_000, kind: "capture" });
    expect(run?.samples.at(-1)).toEqual({ timestampMs: 70_000, progress: 1 });
    expect(run?.samples.find((sample) => sample.timestampMs === 65_000)?.progress).toBe(0.5);
  });

  it("closes a run on a return by the flag's own team and ignores the defender's other events", () => {
    const flagEvents = [flag("steal", B, 1, 10_000), flag("grab", A, 0, 22_000), flag("return", A, 0, 30_000)];

    const [run] = build({ flagEvents }).runs;

    expect(run?.outcome).toBe("return");
    expect(run?.endMs).toBe(30_000);
    expect(run?.events).toEqual([
      { timestampMs: 10_000, kind: "steal" },
      { timestampMs: 20_000, kind: "drop" },
      { timestampMs: 30_000, kind: "return" },
    ]);
  });

  it("hands the flag to the next carrier on a grab and tracks them", () => {
    const relay = "0800000000000000";
    const tracks = [
      ...defaultTracks,
      {
        xuid: relay,
        teamId: 1,
        lives: [
          aFakeStraightLifeWith({
            slot: 530,
            startMs: 20_000,
            endMs: 40_000,
            from: [6000, 1000, 1000],
            to: CAPTURE_1,
            xuid: relay,
          }),
        ],
      },
    ];
    const flagEvents = [flag("steal", B, 1, 10_000), flag("grab", relay, 1, 30_000), flag("capture", relay, 1, 40_000)];

    const [run] = build({ flagEvents, tracks }).runs;

    expect(run?.outcome).toBe("capture");
    expect(run?.events.map((event) => event.kind)).toEqual(["steal", "drop", "grab", "capture"]);
    expect(run?.samples.find((sample) => sample.timestampMs === 25_000)?.progress).toBe(0.5);
    expect(run?.samples.find((sample) => sample.timestampMs === 35_000)?.progress).toBeCloseTo(0.875, 2);
  });

  it("ends an open run at the final whistle while the carrier is still alive", () => {
    const tracks = [
      carrierTrack([
        aFakeStraightLifeWith({
          slot: 520,
          startMs: 5000,
          endMs: 200_000,
          from: STAND_0,
          to: [6000, 1000, 1000],
          xuid: B,
        }),
        aFakeStraightLifeWith({ slot: 521, startMs: 55_000, endMs: 70_000, from: STAND_0, to: CAPTURE_1, xuid: B }),
      ]),
    ];
    const flagEvents = [flag("steal", B, 1, 150_000)];

    const [run] = build({ flagEvents, tracks, highlightEvents: [] }).runs;

    expect(run?.outcome).toBe("matchEnd");
    expect(run?.endMs).toBe(DURATION_MS);
  });

  it("closes a run before the next steal of the same flag even if the auto-return timer has not run out", () => {
    const flagEvents = [flag("steal", B, 1, 10_000), flag("steal", B, 1, 30_000), flag("capture", B, 1, 70_000)];

    const { runs } = build({ flagEvents });

    expect(runs.map((run) => [run.startMs, run.endMs, run.outcome])).toEqual([
      [10_000, 30_000, "autoReturn"],
      [30_000, 70_000, "capture"],
    ]);
  });

  it("keeps a run open past the auto-return timer when a later grab proves the flag was still out", () => {
    const flagEvents = [flag("steal", B, 1, 10_000), flag("grab", B, 1, 60_000), flag("capture", B, 1, 70_000)];

    const [run] = build({ flagEvents }).runs;

    expect(run?.outcome).toBe("capture");
    expect(run?.endMs).toBe(70_000);
    expect(run?.events.map((event) => event.kind)).toEqual(["steal", "drop", "grab", "capture"]);
  });

  it("moves the death feed onto the film clock before reading the carrier's death", () => {
    const [run] = build({ feedOffsetMs: 1500 }).runs;

    expect(run?.events).toEqual([
      { timestampMs: 10_000, kind: "steal" },
      { timestampMs: 21_500, kind: "drop" },
    ]);
  });

  it("treats a carrier whose biped disappears as having dropped the flag where it was last seen", () => {
    const tracks = [
      carrierTrack([
        aFakeStraightLifeWith({
          slot: 520,
          startMs: 10_000,
          endMs: 20_000,
          from: STAND_0,
          to: [6000, 1000, 1000],
          xuid: B,
        }),
        aFakeStraightLifeWith({ slot: 521, startMs: 60_000, endMs: 70_000, from: STAND_0, to: CAPTURE_1, xuid: B }),
      ]),
    ];

    const [run] = build({ tracks, highlightEvents: [] }).runs;

    expect(run?.outcome).toBe("autoReturn");
    expect(run?.events).toEqual([
      { timestampMs: 10_000, kind: "steal" },
      { timestampMs: 20_000, kind: "drop" },
    ]);
    expect(run?.endMs).toBe(20_000 + AUTO_RETURN_MS);
  });

  it("counts a death stamped on the instant of the steal as an immediate drop", () => {
    const highlightEvents = [death(B, 10_000, 1)];

    const [run] = build({ highlightEvents }).runs;

    expect(run?.events.map((event) => [event.kind, event.timestampMs])).toEqual([
      ["steal", 10_000],
      ["drop", 10_000],
    ]);
  });

  it("ignores a steal recorded after the final whistle, leaving the open run to end at the whistle", () => {
    const tracks = [
      carrierTrack([
        aFakeStraightLifeWith({
          slot: 520,
          startMs: 150_000,
          endMs: 200_000,
          from: STAND_0,
          to: [6000, 1000, 1000],
          xuid: B,
        }),
      ]),
    ];
    const flagEvents = [flag("steal", B, 1, 150_000), flag("steal", B, 1, 200_300)];

    const { runs } = build({ flagEvents, tracks, highlightEvents: [] });

    expect(runs.map((run) => [run.endMs, run.outcome])).toEqual([[DURATION_MS, "matchEnd"]]);
  });

  it("closes the current run on a same-frame return before opening the next run on the steal", () => {
    const flagEvents = [
      flag("steal", B, 1, 10_000),
      flag("steal", B, 1, 40_000),
      flag("return", A, 0, 40_000),
      flag("capture", B, 1, 70_000),
    ];

    const { runs } = build({ flagEvents });

    expect(runs.map((run) => [run.startMs, run.endMs, run.outcome])).toEqual([
      [10_000, 40_000, "return"],
      [40_000, 70_000, "capture"],
    ]);
  });

  it("still sees a new carrier's death stamped a few frames before their grab on an unaligned feed", () => {
    const relay = "0800000000000000";
    const flagEvents = [flag("steal", B, 1, 10_000), flag("grab", relay, 1, 12_000)];
    const highlightEvents = [death(relay, 11_700, 1)];

    const [run] = build({ flagEvents, highlightEvents, feedOffsetMs: null }).runs;

    expect(run?.events).toEqual([
      { timestampMs: 10_000, kind: "steal" },
      { timestampMs: 12_000, kind: "grab" },
      { timestampMs: 12_000, kind: "drop" },
    ]);
    expect(run?.outcome).toBe("autoReturn");
    expect(run?.endMs).toBe(12_000 + AUTO_RETURN_MS);
  });

  it("does not call a carrier lost when their own next event proves they still held the flag", () => {
    const tracks = [
      carrierTrack([
        aFakeStraightLifeWith({
          slot: 520,
          startMs: 10_000,
          endMs: 15_000,
          from: STAND_0,
          to: [3500, 1000, 1000],
          xuid: B,
        }),
        aFakeStraightLifeWith({ slot: 520, startMs: 38_000, endMs: 40_000, from: CAPTURE_1, to: CAPTURE_1, xuid: B }),
      ]),
    ];
    const flagEvents = [flag("steal", B, 1, 10_000), flag("capture", B, 1, 40_000)];

    const [run] = build({ flagEvents, tracks, highlightEvents: [] }).runs;

    expect(run?.events.map((event) => event.kind)).toEqual(["steal", "capture"]);
    expect(run?.samples.at(-1)).toEqual({ timestampMs: 40_000, progress: 1 });
  });

  it("treats a carrier's own re-grab as proof the flag had left their hands", () => {
    const tracks = [
      carrierTrack([
        aFakeStraightLifeWith({
          slot: 520,
          startMs: 10_000,
          endMs: 15_000,
          from: STAND_0,
          to: [3500, 1000, 1000],
          xuid: B,
        }),
        aFakeStraightLifeWith({
          slot: 521,
          startMs: 22_000,
          endMs: 30_000,
          from: [3500, 1000, 1000],
          to: CAPTURE_1,
          xuid: B,
        }),
      ]),
    ];
    const flagEvents = [flag("steal", B, 1, 10_000), flag("grab", B, 1, 22_000), flag("capture", B, 1, 30_000)];

    const [run] = build({ flagEvents, tracks, highlightEvents: [] }).runs;

    expect(run?.events.map((event) => [event.kind, event.timestampMs])).toEqual([
      ["steal", 10_000],
      ["drop", 15_000],
      ["grab", 22_000],
      ["capture", 30_000],
    ]);
  });

  it("does not let a skewed death just before the carrier's own capture drop the flag", () => {
    const flagEvents = [flag("steal", B, 1, 60_000), flag("capture", B, 1, 70_000)];
    const highlightEvents = [death(B, 69_500, 1)];

    const [run] = build({ flagEvents, highlightEvents, feedOffsetMs: null }).runs;

    expect(run?.events.map((event) => event.kind)).toEqual(["steal", "capture"]);
  });

  it("places a drop on a carrier's own re-grab when nothing else dates it", () => {
    const tracks = [
      carrierTrack([
        aFakeStraightLifeWith({ slot: 520, startMs: 10_000, endMs: 30_000, from: STAND_0, to: CAPTURE_1, xuid: B }),
      ]),
    ];
    const flagEvents = [flag("steal", B, 1, 10_000), flag("grab", B, 1, 14_000), flag("capture", B, 1, 30_000)];

    const [run] = build({ flagEvents, tracks, highlightEvents: [] }).runs;

    expect(run?.events.map((event) => [event.kind, event.timestampMs])).toEqual([
      ["steal", 10_000],
      ["drop", 14_000],
      ["grab", 14_000],
      ["capture", 30_000],
    ]);
  });

  it("keeps a death the clock shift would push past the whistle on the whistle", () => {
    const highlightEvents = [death(A, 199_500, 0), ...defaultDeaths];

    expect(build({ highlightEvents, feedOffsetMs: 1500 }).deathTimeline).toContainEqual({
      timestampMs: DURATION_MS,
      teamId: 0,
    });
  });

  it("samples the new carrier on the instant of the grab", () => {
    const relay = "0800000000000000";
    const tracks = [
      ...defaultTracks,
      {
        xuid: relay,
        teamId: 1,
        lives: [
          aFakeStraightLifeWith({
            slot: 530,
            startMs: 20_000,
            endMs: 40_000,
            from: [6000, 1000, 1000],
            to: CAPTURE_1,
            xuid: relay,
          }),
        ],
      },
    ];
    const flagEvents = [flag("steal", B, 1, 10_000), flag("grab", relay, 1, 30_000), flag("capture", relay, 1, 40_000)];

    const [run] = build({ flagEvents, tracks }).runs;

    expect(run?.samples.find((sample) => sample.timestampMs === 30_000)?.progress).toBe(0.75);
  });

  it("widens the pre-pickup death window to the whole search range on an unaligned feed", () => {
    const relay = "0800000000000000";
    const flagEvents = [flag("steal", B, 1, 10_000), flag("grab", relay, 1, 12_000)];
    const highlightEvents = [death(relay, 10_800, 1)];

    const [run] = build({ flagEvents, highlightEvents, feedOffsetMs: null }).runs;

    expect(run?.events.map((event) => event.kind)).toEqual(["steal", "grab", "drop"]);
  });

  it("sits a death the clock shift would place before the start on the start", () => {
    const highlightEvents = [death(A, 900, 0), ...defaultDeaths];

    expect(build({ highlightEvents, feedOffsetMs: -1500 }).deathTimeline[0]).toEqual({ timestampMs: 0, teamId: 0 });
  });

  it("keeps a captured run sampleless when its axis cannot be placed", () => {
    const flagEvents = [flag("steal", B, 1, 10_000), flag("capture", B, 1, 20_000)];

    const [run] = build({ flagEvents, tracks: [], highlightEvents: [] }).runs;

    expect(run?.outcome).toBe("capture");
    expect(run?.samples).toEqual([]);
  });

  it("keeps the terminal capture sample at the whistle when the capture lands just after it", () => {
    const flagEvents = [flag("steal", B, 1, 60_000), flag("capture", B, 1, 70_200)];

    const [run] = build({ flagEvents, durationMs: 70_000 }).runs;

    expect(run?.samples.at(-1)).toEqual({ timestampMs: 70_000, progress: 1 });
  });

  it("puts the death timeline on the film clock with the same offset as the drops", () => {
    expect(build({ feedOffsetMs: 1500 }).deathTimeline).toEqual([{ timestampMs: 21_500, teamId: 1 }]);
  });

  it("passes the unresolved stat slots through", () => {
    expect(build({ unresolvedSlots: [18] }).unresolvedSlots).toEqual([18]);
  });

  it("holds a run open to the whistle for a carrier with no track at all and emits no samples", () => {
    const flagEvents = [flag("steal", B, 1, 10_000)];

    const [run] = build({ flagEvents, tracks: [], highlightEvents: [] }).runs;

    expect(run?.events).toEqual([{ timestampMs: 10_000, kind: "steal" }]);
    expect(run?.outcome).toBe("matchEnd");
    expect(run?.samples).toEqual([]);
  });

  it("places the drop on the return when nothing dates the carrier letting go", () => {
    const tracks = [
      carrierTrack([
        aFakeStraightLifeWith({ slot: 520, startMs: 10_000, endMs: 60_000, from: STAND_0, to: CAPTURE_1, xuid: B }),
      ]),
    ];
    const flagEvents = [flag("steal", B, 1, 10_000), flag("return", A, 0, 30_000)];

    const [run] = build({ flagEvents, tracks, highlightEvents: [] }).runs;

    expect(run?.events).toEqual([
      { timestampMs: 10_000, kind: "steal" },
      { timestampMs: 30_000, kind: "drop" },
      { timestampMs: 30_000, kind: "return" },
    ]);
  });

  it("clamps events and samples to the match duration", () => {
    const flagEvents = [flag("steal", B, 1, 60_000), flag("capture", B, 1, 70_000)];

    const { events, runs } = build({ flagEvents, durationMs: 68_000 });

    expect(events[0]?.timestampMs).toBe(68_000);
    expect(runs[0]?.endMs).toBe(68_000);
    expect(runs[0]?.samples.every((sample) => sample.timestampMs <= 68_000)).toBe(true);
  });

  it("builds the death timeline for the player-advantage overlay", () => {
    expect(build().deathTimeline).toEqual([{ timestampMs: 20_000, teamId: 1 }]);
    expect(build().teamCount).toBe(2);
  });

  it("builds no runs for a match without exactly two teams", () => {
    const matchStats = aFakeCtfMatchStatsWith();
    matchStats.Teams = matchStats.Teams.slice(0, 1);

    const progression = buildCtfProgression({
      flagEvents: defaultFlagEvents,
      unresolvedSlots: [],
      positions: aFakePlayerPositionsWith({ tracks: defaultTracks }),
      highlightEvents: defaultDeaths,
      matchStats,
      durationMs: DURATION_MS,
    });

    expect(progression.runs).toEqual([]);
    expect(progression.teamCount).toBe(1);
  });
});
