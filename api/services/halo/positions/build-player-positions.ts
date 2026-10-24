import type { MatchStats } from "halo-infinite-api";
import { getTeamIdsByXuid } from "@guilty-spark/shared/halo/match-stats";
import type { ReplicationChunk } from "../types";
import { earliestTimestampUs, PACKET_TYPE_FRAME, packetTimestampMs, walkPackets } from "../statborg/bit-reader";
import { detectAxisLayout } from "./axis-layout";
import { scanBipedRecords } from "./biped-records";
import { bipedSlotBand } from "./keyframe-slots";
import { buildLives, nameLivesByDeaths, nameLivesByElimination, nameLivesByRespawnOrder } from "./lives";
import { dropIsolated, dropTeleports } from "./position-filters";
import type { AxisLayout, BipedLife, BipedPosition, DeathEvent, PlayerPositions, PlayerPositionTrack } from "./types";

export class PositionDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PositionDecodeError";
  }
}

export function scanChunkPositions(
  chunk: ReplicationChunk,
  slots: ReadonlySet<number>,
  layout: AxisLayout,
): BipedPosition[] {
  const frames = walkPackets(chunk.data).filter((packet) => packet.type === PACKET_TYPE_FRAME);
  const originUs = earliestTimestampUs(frames);
  if (originUs == null) {
    return [];
  }
  const positions: BipedPosition[] = [];
  for (const frame of frames) {
    const timestampMs = packetTimestampMs(chunk.startMs, originUs, frame);
    const payload = chunk.data.subarray(frame.payloadOffset, frame.payloadOffset + frame.payloadSize);
    for (const record of scanBipedRecords(payload, slots, layout)) {
      positions.push({ slot: record.slot, timestampMs, timestampUs: frame.timestampUs, q: record.q });
    }
  }
  return positions;
}

function groupTracks(lives: readonly BipedLife[], teamIdsByXuid: ReadonlyMap<string, number>): PlayerPositionTrack[] {
  const byXuid = new Map<string, BipedLife[]>();
  for (const life of lives) {
    if (life.xuid == null) {
      continue;
    }
    const list = byXuid.get(life.xuid) ?? [];
    list.push(life);
    byXuid.set(life.xuid, list);
  }
  const tracks: PlayerPositionTrack[] = [];
  for (const [xuid, playerLives] of byXuid) {
    const teamId = teamIdsByXuid.get(xuid);
    if (teamId != null) {
      tracks.push({ xuid, teamId, lives: playerLives.sort((a, b) => a.startMs - b.startMs) });
    }
  }
  return tracks.sort((a, b) => a.xuid.localeCompare(b.xuid));
}

function assertDecodableChunks(chunks: readonly ReplicationChunk[], matchId: string): void {
  if (chunks.length === 0) {
    throw new PositionDecodeError(`Film for match ${matchId} has no replication chunks`);
  }
  const empty = chunks.find((chunk) => chunk.data.length === 0);
  if (empty != null) {
    throw new PositionDecodeError(`Film for match ${matchId} has an empty replication chunk: ${String(empty.index)}`);
  }
}

function nameLives(lives: readonly BipedLife[], deaths: readonly DeathEvent[], roster: readonly string[]): BipedLife[] {
  const byDeaths = nameLivesByElimination(nameLivesByDeaths(lives, deaths), roster);
  return nameLivesByElimination(nameLivesByRespawnOrder(byDeaths, roster), roster);
}

export function buildPlayerPositions(
  chunks: readonly ReplicationChunk[],
  matchStats: MatchStats,
  deaths: readonly DeathEvent[],
): PlayerPositions {
  assertDecodableChunks(chunks, matchStats.MatchId);
  const slots = bipedSlotBand(chunks);
  if (slots.size === 0) {
    throw new PositionDecodeError(`Film for match ${matchStats.MatchId} lists no biped slots in its keyframes`);
  }
  const layout = detectAxisLayout(chunks, slots);
  const raw: BipedPosition[] = [];
  for (const chunk of chunks) {
    for (const position of scanChunkPositions(chunk, slots, layout)) {
      raw.push(position);
    }
  }
  const positions = dropTeleports(dropIsolated(raw));
  const teamIdsByXuid = getTeamIdsByXuid(matchStats);
  const rosterDeaths = deaths.filter((death) => teamIdsByXuid.has(death.xuid));
  const named = nameLives(buildLives(positions), rosterDeaths, [...teamIdsByXuid.keys()]);
  return {
    layout,
    tracks: groupTracks(named, teamIdsByXuid),
    unnamedLives: named.filter((life) => life.xuid == null),
  };
}
