import type { ReplicationChunk } from "../../types";
import { PACKET_TYPE_FRAME, PACKET_TYPE_KEYFRAME } from "../../statborg/bit-reader";
import { BitWriter, buildChunkBytes } from "../../statborg/fakes/replication-chunk.fake";
import type { PacketSpec } from "../../statborg/fakes/replication-chunk.fake";
import type { AxisLayout, Quantum3 } from "../types";

// Encodes synthetic keyframe entity lists and biped delta records in the measured grammars
// (see keyframe-slots.ts and biped-records.ts) so decoder tests can assert on known slots,
// quanta and lives.
export const FAKE_AXIS_LAYOUT: AxisLayout = { gateBits: 5, axisWidths: [15, 15, 17] };
export const FAKE_ORIGIN: Quantum3 = [12_000, 12_000, 70_000];
export const BIPED_ARCHETYPE = 35;

export interface KeyframeEntitySpec {
  slot: number;
  archetype: number;
  generation?: number | undefined;
  stateBits?: number | undefined;
}

export interface BipedRecordSpec {
  slot: number;
  q: Quantum3;
  gate?: number | undefined;
  maskCount?: number | undefined;
  componentIndices?: readonly number[] | undefined;
  trailingBits?: number | undefined;
}

export interface LifeSpec {
  slot: number;
  startMs: number;
  endMs: number;
  origin?: Quantum3 | undefined;
}

export interface PositionFilmSpec {
  lives: readonly LifeSpec[];
  layout?: AxisLayout | undefined;
  frameIntervalMs?: number | undefined;
  chunkDurationMs?: number | undefined;
  firstChunkStartMs?: number | undefined;
  firstChunkIndex?: number | undefined;
  extraEntities?: readonly KeyframeEntitySpec[] | undefined;
}

const DEFAULT_STATE_BITS = 40;
const DEFAULT_TRAILING_BITS = 32;
const PAYLOAD_TAIL_BITS = 64;
const SENTINEL_BITS = 32;
const WALK_STEPS = [-3, -2, -1, 0, 1, 2, 3];

export function writeKeyframeEntity(writer: BitWriter, entity: KeyframeEntitySpec): void {
  writer.write(entity.generation ?? 1, 2);
  writer.write(entity.slot, 30);
  writer.write(0, 26);
  writer.write(entity.archetype, 6);
  writer.write(0, entity.stateBits ?? DEFAULT_STATE_BITS);
}

// a keyframe starts one bit in, lists its entities in slot order and ends with the sentinel
// followed by set bits, which no anchor can be read from
export function buildKeyframePayload(entities: readonly KeyframeEntitySpec[]): Uint8Array {
  const writer = new BitWriter();
  writer.write(0, 1);
  for (const entity of [...entities].sort((a, b) => a.slot - b.slot)) {
    writeKeyframeEntity(writer, entity);
  }
  writer.write(0xffff_ffff, SENTINEL_BITS);
  for (let bit = 0; bit < PAYLOAD_TAIL_BITS; bit++) {
    writer.write(1, 1);
  }
  return writer.toBytes();
}

export function writeBipedRecord(writer: BitWriter, record: BipedRecordSpec, layout: AxisLayout): void {
  const indices = record.componentIndices ?? [...Array(record.maskCount ?? 2).keys()];
  writer.write(1, 1);
  writer.write(record.slot, 13);
  writer.write(0b01, 2);
  writer.write(0, 2);
  writer.write(indices.length, 3);
  for (const index of indices) {
    writer.write(index, 6);
  }
  writer.write(record.gate ?? 0, layout.gateBits);
  for (const [axis, width] of layout.axisWidths.entries()) {
    writer.write(record.q[axis] ?? 0, width);
  }
  writer.write(0, record.trailingBits ?? DEFAULT_TRAILING_BITS);
}

export function buildBipedFramePayload(
  records: readonly BipedRecordSpec[],
  layout: AxisLayout = FAKE_AXIS_LAYOUT,
): Uint8Array {
  const writer = new BitWriter();
  for (const record of records) {
    writeBipedRecord(writer, record, layout);
  }
  writer.write(0, PAYLOAD_TAIL_BITS);
  return writer.toBytes();
}

// a deterministic small random walk: each frame moves every axis by a few quanta, which is what
// makes the low bits of a position flip and its high bits hold still
export function walkPosition(origin: Quantum3, slot: number, step: number): Quantum3 {
  let seed = (slot * 2_654_435_761 + 12_345) >>> 0;
  const position: [number, number, number] = [origin[0], origin[1], origin[2]];
  for (let index = 0; index < step; index++) {
    for (let axis = 0; axis < 3; axis++) {
      seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
      position[axis] = (position[axis] ?? 0) + (WALK_STEPS[seed % WALK_STEPS.length] ?? 0);
    }
  }
  return position;
}

function isAlive(life: LifeSpec, atMs: number): boolean {
  return life.startMs <= atMs && atMs <= life.endMs;
}

function keyframePacket(spec: PositionFilmSpec, chunkStartMs: number): PacketSpec {
  const entities: KeyframeEntitySpec[] = spec.lives
    .filter((life) => isAlive(life, chunkStartMs))
    .map((life) => ({ slot: life.slot, archetype: BIPED_ARCHETYPE }));
  entities.push(...(spec.extraEntities ?? []));
  return {
    type: PACKET_TYPE_KEYFRAME,
    timestampUs: BigInt(chunkStartMs) * 1000n,
    payload: buildKeyframePayload(entities),
  };
}

function framePacket(spec: PositionFilmSpec, atMs: number, frameIntervalMs: number): PacketSpec {
  const layout = spec.layout ?? FAKE_AXIS_LAYOUT;
  const records: BipedRecordSpec[] = spec.lives
    .filter((life) => isAlive(life, atMs))
    .map((life) => ({
      slot: life.slot,
      q: walkPosition(life.origin ?? FAKE_ORIGIN, life.slot, Math.floor((atMs - life.startMs) / frameIntervalMs)),
    }));
  return {
    type: PACKET_TYPE_FRAME,
    timestampUs: BigInt(atMs) * 1000n,
    payload: buildBipedFramePayload(records, layout),
  };
}

export function aFakePositionFilmWith(spec: PositionFilmSpec): ReplicationChunk[] {
  const frameIntervalMs = spec.frameIntervalMs ?? 100;
  const chunkDurationMs = spec.chunkDurationMs ?? 20_000;
  const firstChunkStartMs = spec.firstChunkStartMs ?? 1000;
  const endMs = Math.max(...spec.lives.map((life) => life.endMs));
  const chunks: ReplicationChunk[] = [];
  for (let chunkStartMs = firstChunkStartMs; chunkStartMs <= endMs; chunkStartMs += chunkDurationMs) {
    const packets: PacketSpec[] = [keyframePacket(spec, chunkStartMs)];
    for (let atMs = chunkStartMs; atMs < chunkStartMs + chunkDurationMs; atMs += frameIntervalMs) {
      packets.push(framePacket(spec, atMs, frameIntervalMs));
    }
    chunks.push({
      index: (spec.firstChunkIndex ?? 1) + chunks.length,
      startMs: chunkStartMs,
      durationMs: chunkDurationMs,
      data: buildChunkBytes(packets),
    });
  }
  return chunks;
}

export function aFakeKeyframeChunkWith(
  entities: readonly KeyframeEntitySpec[],
  overrides: Partial<Omit<ReplicationChunk, "data">> = {},
): ReplicationChunk {
  const chunk = { index: 1, startMs: 1000, durationMs: 20_000, ...overrides };
  const timestampUs = BigInt(chunk.startMs) * 1000n;
  return {
    ...chunk,
    data: buildChunkBytes([{ type: PACKET_TYPE_KEYFRAME, timestampUs, payload: buildKeyframePayload(entities) }]),
  };
}

export function aFakeBipedFrameChunkWith(
  frames: readonly { timestampUs: bigint; records: readonly BipedRecordSpec[] }[],
  layout: AxisLayout = FAKE_AXIS_LAYOUT,
  overrides: Partial<Omit<ReplicationChunk, "data">> = {},
): ReplicationChunk {
  return {
    index: 1,
    startMs: 1000,
    durationMs: 20_000,
    ...overrides,
    data: buildChunkBytes(
      frames.map((frame) => ({
        type: PACKET_TYPE_FRAME,
        timestampUs: frame.timestampUs,
        payload: buildBipedFramePayload(frame.records, layout),
      })),
    ),
  };
}
