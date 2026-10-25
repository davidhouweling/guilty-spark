import type { BipedLife, PlayerPositions, PlayerPositionTrack, PositionSample, Quantum3 } from "../types";

export interface StraightLifeSpec {
  slot: number;
  startMs: number;
  endMs: number;
  from: Quantum3;
  to: Quantum3;
  xuid: string;
  intervalMs: number;
}

const DEFAULT_STRAIGHT_LIFE: StraightLifeSpec = {
  slot: 512,
  startMs: 1000,
  endMs: 11_000,
  from: [1000, 1000, 1000],
  to: [11_000, 1000, 1000],
  xuid: "0100000000000000",
  intervalMs: 500,
};

// a life whose biped moves in a straight line at a steady pace, sampled on a fixed interval
export function aFakeStraightLifeWith(overrides: Partial<StraightLifeSpec> = {}): BipedLife {
  const spec = { ...DEFAULT_STRAIGHT_LIFE, ...overrides };
  const samples: PositionSample[] = [];
  for (let atMs = spec.startMs; atMs <= spec.endMs; atMs += spec.intervalMs) {
    const fraction = spec.endMs === spec.startMs ? 1 : (atMs - spec.startMs) / (spec.endMs - spec.startMs);
    samples.push({
      timestampMs: atMs,
      q: [
        Math.round(spec.from[0] + (spec.to[0] - spec.from[0]) * fraction),
        Math.round(spec.from[1] + (spec.to[1] - spec.from[1]) * fraction),
        Math.round(spec.from[2] + (spec.to[2] - spec.from[2]) * fraction),
      ],
    });
  }
  return { slot: spec.slot, startMs: spec.startMs, endMs: spec.endMs, samples, xuid: spec.xuid };
}

export function aFakePlayerPositionsWith(overrides: Partial<PlayerPositions> = {}): PlayerPositions {
  return {
    layout: { gateBits: 5, axisWidths: [15, 15, 17] },
    tracks: [],
    unnamedLives: [],
    feedOffsetMs: 0,
    ...overrides,
  };
}

export function aFakePlayerPositionTrackWith(overrides: Partial<PlayerPositionTrack> = {}): PlayerPositionTrack {
  return { xuid: "0100000000000000", teamId: 0, lives: [aFakeStraightLifeWith()], ...overrides };
}
