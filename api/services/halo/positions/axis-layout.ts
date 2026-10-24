import type { ReplicationChunk } from "../types";
import { PACKET_TYPE_FRAME, readBitsBE, walkPackets } from "../statborg/bit-reader";
import {
  BIPED_HEADER_BITS,
  BIPED_INDEX_BITS,
  forEachCandidateBit,
  matchBipedHeader,
  slotPrefilter,
} from "./biped-records";
import type { AxisLayout } from "./types";

// The axis widths of the position component are a per-map constant that never travels in the
// bitstream, but they can be read off the film: a quantised field that moves a little between
// consecutive frames flips its low bits about half the time and its high bits almost never, so
// the flip rate per bit position is a saw-tooth whose collapses mark each field's MSB
// (LevelUp filmdec/i0_layout.go).
const SPINE_BITS = 3;
const USE_DEFAULT_BITS = 1;
const REGION_INDEX_BITS = 1;
export const DEFAULT_GATE_BITS = SPINE_BITS + USE_DEFAULT_BITS + REGION_INDEX_BITS;
const DETECT_WINDOW_BITS = 72;
const DETECT_MAX_CHUNKS = 6;
const DETECT_MAX_PACKET_GAP = 3;
const BOUNDARY_SATURATION = 0.1;
const BOUNDARY_DROP = 8;
const MIN_AXIS_BITS = 8;
const MAX_AXIS_BITS = 26;

interface LayoutSample {
  readonly slot: number;
  readonly chunk: number;
  readonly packet: number;
  readonly bits: Uint8Array;
}

export class AxisLayoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AxisLayoutError";
  }
}

function collectSamples(
  payload: Uint8Array,
  slots: ReadonlySet<number>,
  chunk: number,
  packet: number,
): LayoutSample[] {
  const totalBits = payload.length * 8;
  const samples: LayoutSample[] = [];
  const limitBit = totalBits - (BIPED_HEADER_BITS + BIPED_INDEX_BITS * 2 + DETECT_WINDOW_BITS) + 1;
  forEachCandidateBit(payload, slotPrefilter(slots), limitBit, (bitPos) => {
    const header = matchBipedHeader(payload, bitPos, totalBits, slots, DETECT_WINDOW_BITS);
    if (header == null || readBitsBE(payload, header.positionBit, DEFAULT_GATE_BITS) !== 0) {
      return null;
    }
    const bits = new Uint8Array(DETECT_WINDOW_BITS);
    for (let bit = 0; bit < DETECT_WINDOW_BITS; bit++) {
      bits[bit] = readBitsBE(payload, header.positionBit + bit, 1);
    }
    samples.push({ slot: header.slot, chunk, packet, bits });
    return header.positionBit + DETECT_WINDOW_BITS / 2;
  });
  return samples;
}

export interface FlipProfile {
  readonly pairs: number;
  readonly flipRates: readonly number[];
}

// flips are counted between consecutive records of the same slot in neighbouring packets of
// one chunk: it is the continuity of a player's movement that produces the saw-tooth
export function profileFlips(samples: readonly LayoutSample[]): FlipProfile {
  const flips = new Array<number>(DETECT_WINDOW_BITS).fill(0);
  let pairs = 0;
  const bySlot = new Map<number, LayoutSample[]>();
  for (const sample of samples) {
    const list = bySlot.get(sample.slot) ?? [];
    list.push(sample);
    bySlot.set(sample.slot, list);
  }
  for (const list of bySlot.values()) {
    list.sort((a, b) => a.chunk - b.chunk || a.packet - b.packet);
    for (let index = 1; index < list.length; index++) {
      const previous = list[index - 1];
      const current = list[index];
      if (previous == null || current == null) {
        continue;
      }
      const packetGap = current.packet - previous.packet;
      if (previous.chunk !== current.chunk || packetGap <= 0 || packetGap > DETECT_MAX_PACKET_GAP) {
        continue;
      }
      pairs += 1;
      for (let bit = 0; bit < DETECT_WINDOW_BITS; bit++) {
        if (previous.bits[bit] !== current.bits[bit]) {
          flips[bit] = (flips[bit] ?? 0) + 1;
        }
      }
    }
  }
  return { pairs, flipRates: flips.map((count) => (pairs > 0 ? count / pairs : 0)) };
}

// a bit is a field's MSB when the bit before it flipped often (an LSB) and it almost never does
export function flipBoundaries(flipRates: readonly number[]): number[] {
  const boundaries: number[] = [];
  for (let bit = 1; bit < flipRates.length; bit++) {
    const previous = flipRates[bit - 1] ?? 0;
    const current = flipRates[bit] ?? 0;
    if (previous >= BOUNDARY_SATURATION && current * BOUNDARY_DROP < previous) {
      boundaries.push(bit);
    }
  }
  return boundaries;
}

export function layoutFromBoundaries(boundaries: readonly number[]): AxisLayout | null {
  const [first, second, third] = boundaries;
  if (first == null || second == null || third == null) {
    return null;
  }
  const layout: AxisLayout = {
    gateBits: DEFAULT_GATE_BITS,
    axisWidths: [first - DEFAULT_GATE_BITS, second - first, third - second],
  };
  return layout.axisWidths.every((width) => width >= MIN_AXIS_BITS && width <= MAX_AXIS_BITS) ? layout : null;
}

export function detectAxisLayout(chunks: readonly ReplicationChunk[], slots: ReadonlySet<number>): AxisLayout {
  if (slots.size === 0) {
    throw new AxisLayoutError("Position axis layout needs at least one biped slot to profile");
  }
  const samples: LayoutSample[] = [];
  for (const chunk of chunks.slice(0, DETECT_MAX_CHUNKS)) {
    for (const [packetIndex, packet] of walkPackets(chunk.data).entries()) {
      if (packet.type !== PACKET_TYPE_FRAME) {
        continue;
      }
      const payload = chunk.data.subarray(packet.payloadOffset, packet.payloadOffset + packet.payloadSize);
      samples.push(...collectSamples(payload, slots, chunk.index, packetIndex));
    }
  }
  const profile = profileFlips(samples);
  const layout = layoutFromBoundaries(flipBoundaries(profile.flipRates));
  if (layout == null) {
    throw new AxisLayoutError(
      `Position axis layout could not be read from the film (${String(profile.pairs)} record pairs, ${String(samples.length)} samples)`,
    );
  }
  return layout;
}
