import type { MatchStats } from "halo-infinite-api";
import type { ReplicationChunk } from "../types";
import { datedFrames } from "../statborg/bit-reader";
import { detectAxisLayout } from "./axis-layout";
import { scanBipedRecords } from "./biped-records";
import { bipedSlotBand } from "./keyframe-slots";
import {
  buildLives,
  nameLivesByDeaths,
  nameLivesByElimination,
  nameLivesByRespawnOrder,
  nameLivesBySlot,
} from "./lives";
import { dropIsolated, dropTeleports } from "./position-filters";
import { buildRoster } from "./roster";
import type {
  AxisLayout,
  BipedLife,
  BipedPosition,
  DeathEvent,
  PlayerPositions,
  PlayerPositionTrack,
  RosterMember,
} from "./types";

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
  const positions: BipedPosition[] = [];
  for (const { timestampMs, payload } of datedFrames(chunk)) {
    for (const record of scanBipedRecords(payload, slots, layout)) {
      positions.push({ slot: record.slot, timestampMs, q: record.q });
    }
  }
  return positions;
}

function groupTracks(lives: readonly BipedLife[], roster: readonly RosterMember[]): PlayerPositionTrack[] {
  const tracks: PlayerPositionTrack[] = [];
  for (const member of roster) {
    const playerLives = lives.filter((life) => life.xuid === member.xuid).sort((a, b) => a.startMs - b.startMs);
    if (playerLives.length > 0) {
      tracks.push({ xuid: member.xuid, teamId: member.teamId, lives: playerLives });
    }
  }
  return tracks.sort((a, b) => a.xuid.localeCompare(b.xuid));
}

function nameLives(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  roster: readonly RosterMember[],
): BipedLife[] {
  const byDeaths = nameLivesByElimination(nameLivesBySlot(nameLivesByDeaths(lives, deaths)), roster);
  return nameLivesByElimination(nameLivesBySlot(nameLivesByRespawnOrder(byDeaths, deaths, roster)), roster);
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
  const roster = buildRoster(matchStats);
  const rosterXuids = new Set(roster.map((member) => member.xuid));
  const rosterDeaths = deaths.filter((death) => rosterXuids.has(death.xuid));
  const named = nameLives(buildLives(positions), rosterDeaths, roster);
  return {
    layout,
    tracks: groupTracks(named, roster),
    unnamedLives: named.filter((life) => life.xuid == null),
  };
}
