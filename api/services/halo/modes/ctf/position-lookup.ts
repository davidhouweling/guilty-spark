import type { PlayerPositions, PositionSample, Quantum3 } from "../../positions/types";

// a carrier's position is read from the nearest sample of any of their lives; beyond this
// distance the film has no biped for them (dead, unnamed or not replicated) and the caller
// holds the last known flag position instead
export const POSITION_TOLERANCE_MS = 600;

function nearestSample(samples: readonly PositionSample[], atMs: number): PositionSample | null {
  if (samples.length === 0) {
    return null;
  }
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((samples[mid]?.timestampMs ?? 0) < atMs) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  const after = samples[low] ?? null;
  const before = samples[low - 1] ?? null;
  if (before == null || after == null) {
    return after ?? before;
  }
  return atMs - before.timestampMs <= after.timestampMs - atMs ? before : after;
}

export class PositionLookup {
  private readonly samplesByXuid: ReadonlyMap<string, readonly PositionSample[]>;

  constructor(positions: PlayerPositions) {
    this.samplesByXuid = new Map(
      positions.tracks.map((track) => [
        track.xuid,
        track.lives.flatMap((life) => life.samples).sort((a, b) => a.timestampMs - b.timestampMs),
      ]),
    );
  }

  positionAt(xuid: string, atMs: number): Quantum3 | null {
    return this.sampleAt(xuid, atMs)?.q ?? null;
  }

  sampleAt(xuid: string, atMs: number): PositionSample | null {
    const samples = this.samplesByXuid.get(xuid) ?? [];
    const nearest = nearestSample(samples, atMs);
    return nearest != null && Math.abs(nearest.timestampMs - atMs) <= POSITION_TOLERANCE_MS ? nearest : null;
  }
}
