import type { MatchStats } from "halo-infinite-api";
import { getTeamIdsByXuid } from "@guilty-spark/shared/halo/match-stats";
import type { ReplicationChunk } from "../types";
import { PACKET_TYPE_FRAME, walkPackets } from "../statborg/bit-reader";
import { detectAxisLayout } from "./axis-layout";
import { scanBipedRecords } from "./biped-records";
import { bipedSlotBand } from "./keyframe-slots";
import { buildLives, nameLivesByDeaths, nameLivesByElimination, nameLivesByRespawnOrder } from "./lives";
import { dropIsolated, dropTeleports } from "./position-filters";
import type { AxisLayout, BipedLife, BipedPosition, DeathEvent, PlayerPositions, PlayerPositionTrack } from "./types";

const MICROS_PER_MILLI = 1000n;

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
  const [firstFrame] = frames;
  if (firstFrame == null) {
    return [];
  }
  const positions: BipedPosition[] = [];
  for (const frame of frames) {
    const timestampMs = chunk.startMs + Number((frame.timestampUs - firstFrame.timestampUs) / MICROS_PER_MILLI);
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

function nameLives(lives: readonly BipedLife[], deaths: readonly DeathEvent[], roster: readonly string[]): BipedLife[] {
  const byDeaths = nameLivesByElimination(nameLivesByDeaths(lives, deaths), roster);
  return nameLivesByElimination(nameLivesByRespawnOrder(byDeaths, roster), roster);
}

export function buildPlayerPositions(
  chunks: readonly ReplicationChunk[],
  matchStats: MatchStats,
  deaths: readonly DeathEvent[],
): PlayerPositions {
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
  const named = nameLives(buildLives(positions), deaths, [...teamIdsByXuid.keys()]);
  return {
    layout,
    tracks: groupTracks(named, teamIdsByXuid),
    unnamedLives: named.filter((life) => life.xuid == null),
  };
}
