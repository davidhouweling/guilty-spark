import { describe, expect, it } from "vitest";
import { aFakeParsedHighlightEventWith } from "../../../fakes/parsed-highlight-event.fake";
import type { PlayerPositionTrack, Quantum3 } from "../../../positions/types";
import { aFakeCtfFlagEventWith } from "../../../statborg/fakes/ctf-flag-event.fake";
import { aFakeCtfMatchStatsWith } from "../../../statborg/fakes/ctf-match-stats.fake";
import type { CtfFlagEvent } from "../../../statborg/types";
import type { ParsedHighlightEvent } from "../../../types";
import { AUTO_RETURN_MS, buildCtfProgression } from "../ctf-progression";
import { aFakePlayerPositionsWith, aFakeStraightLifeWith } from "../fakes/ctf-positions.fake";

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

function build(
  overrides: {
    flagEvents?: readonly CtfFlagEvent[];
    tracks?: readonly PlayerPositionTrack[];
    highlightEvents?: readonly ParsedHighlightEvent[];
    durationMs?: number;
  } = {},
): ReturnType<typeof buildCtfProgression> {
  return buildCtfProgression({
    flagEvents: overrides.flagEvents ?? defaultFlagEvents,
    positions: aFakePlayerPositionsWith(overrides.tracks ?? defaultTracks),
    highlightEvents: overrides.highlightEvents ?? defaultDeaths,
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

    const {runs} = build({ flagEvents });

    expect(runs.map((run) => [run.startMs, run.endMs, run.outcome])).toEqual([
      [10_000, 30_000, "autoReturn"],
      [30_000, 70_000, "capture"],
    ]);
  });

  it("emits a run without samples when neither stand nor capture point can be placed", () => {
    const flagEvents = [flag("steal", B, 1, 10_000)];

    const [run] = build({ flagEvents, tracks: [], highlightEvents: [] }).runs;

    expect(run?.outcome).toBe("matchEnd");
    expect(run?.samples).toEqual([]);
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
      positions: aFakePlayerPositionsWith(defaultTracks),
      highlightEvents: defaultDeaths,
      matchStats,
      durationMs: DURATION_MS,
    });

    expect(progression.runs).toEqual([]);
    expect(progression.teamCount).toBe(1);
  });
});
