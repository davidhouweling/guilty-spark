import type {
  BipedLife,
  PlayerPositions,
  PlayerPositionTrack,
  PositionSample,
  Quantum3,
} from "../../../positions/types";

export interface StraightLifeSpec {
  slot: number;
  startMs: number;
  endMs: number;
  from: Quantum3;
  to: Quantum3;
  xuid: string;
  intervalMs?: number | undefined;
}

// a life whose biped moves in a straight line at a steady pace, sampled on a fixed interval
export function aFakeStraightLifeWith(spec: StraightLifeSpec): BipedLife {
  const intervalMs = spec.intervalMs ?? 500;
  const samples: PositionSample[] = [];
  for (let atMs = spec.startMs; atMs <= spec.endMs; atMs += intervalMs) {
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

export function aFakePlayerPositionsWith(tracks: readonly PlayerPositionTrack[] = []): PlayerPositions {
  return { layout: { gateBits: 5, axisWidths: [15, 15, 17] }, tracks, unnamedLives: [] };
}
