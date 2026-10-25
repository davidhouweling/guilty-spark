import type { MatchStats } from "halo-infinite-api";
import type { ReplicationChunk } from "../types";
import { walkChunk } from "../statborg/bit-reader";
import type { WalkedChunk } from "../statborg/bit-reader";
import { detectAxisLayout } from "./axis-layout";
import { BipedRecordScanner } from "./biped-records";
import { bipedSlotBand } from "./keyframe-slots";
import { LifeNamer } from "./life-namer";
import { buildLives } from "./lives";
import { dropIsolated, dropTeleports } from "./position-filters";
import { buildRoster } from "./roster";
import type {
  BipedLife,
  BipedPosition,
  DeathEvent,
  DecodedPositions,
  PlayerPositions,
  PlayerPositionTrack,
  RosterMember,
} from "./types";

// one slot per spawn: a full lobby of 24 dying every 15 seconds for 15 minutes stays well below
const MAX_BIPED_SLOTS = 2048;

export class PositionDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PositionDecodeError";
  }
}

export function scanChunkPositions(chunk: WalkedChunk, scanner: BipedRecordScanner): BipedPosition[] {
  const positions: BipedPosition[] = [];
  for (const { timestampMs, payload } of chunk.frames) {
    for (const record of scanner.scan(payload)) {
      positions.push({ slot: record.slot, timestampMs, q: record.q });
    }
  }
  return positions;
}

// every player may spawn twice between two keyframes, before the first or after the last
const SPARE_SLOTS_PER_PLAYER = 2;

export function decodePositions(chunks: readonly WalkedChunk[], matchStats: MatchStats): DecodedPositions {
  const slots = bipedSlotBand(chunks, matchStats.Players.length * SPARE_SLOTS_PER_PLAYER);
  if (slots.size === 0) {
    throw new PositionDecodeError(`Film for match ${matchStats.MatchId} lists no biped slots in its keyframes`);
  }
  if (slots.size > MAX_BIPED_SLOTS) {
    throw new PositionDecodeError(
      `Film for match ${matchStats.MatchId} spans ${String(slots.size)} biped slots, more than a match can allocate`,
    );
  }
  const layout = detectAxisLayout(chunks, slots);
  const scanner = new BipedRecordScanner(slots, layout);
  return { layout, slots, scanned: chunks.flatMap((chunk) => scanChunkPositions(chunk, scanner)) };
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

export function namePositions(
  decoded: DecodedPositions,
  matchStats: MatchStats,
  deaths: readonly DeathEvent[],
): PlayerPositions {
  const positions = dropTeleports(dropIsolated(decoded.scanned));
  const roster = buildRoster(matchStats);
  const rosterXuids = new Set(roster.map((member) => member.xuid));
  const rosterDeaths = deaths.filter((death) => rosterXuids.has(death.xuid));
  const lives = buildLives(positions);
  const namer = LifeNamer.forMatch(lives, rosterDeaths, roster);
  const named = namer.name(lives);
  return {
    layout: decoded.layout,
    tracks: groupTracks(named, roster),
    unnamedLives: named.filter((life) => life.xuid == null),
    feedOffsetMs: namer.offsetMs,
  };
}

export function emptyPlayerPositions(): PlayerPositions {
  return { layout: { gateBits: 0, axisWidths: [0, 0, 0] }, tracks: [], unnamedLives: [], feedOffsetMs: null };
}

export function buildPlayerPositions(
  chunks: readonly ReplicationChunk[],
  matchStats: MatchStats,
  deaths: readonly DeathEvent[],
): PlayerPositions {
  return namePositions(decodePositions(chunks.map(walkChunk), matchStats), matchStats, deaths);
}
