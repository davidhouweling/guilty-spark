import type { MatchStats } from "halo-infinite-api";
import type { ReplicationChunk } from "../types";
import { walkChunk } from "../statborg/bit-reader";
import type { WalkedChunk } from "../statborg/bit-reader";
import { detectAxisLayout } from "./axis-layout";
import { BipedRecordScanner } from "./biped-records";
import { bipedSlotBand } from "./keyframe-slots";
import {
  alignDeathsToFilm,
  buildLives,
  nameLivesByDeaths,
  nameLivesByElimination,
  nameLivesByRespawnOrder,
  nameLivesBySlot,
} from "./lives";
import { dropIsolated, dropTeleports } from "./position-filters";
import { alignRosterToFilm, buildRoster } from "./roster";
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

function namingRound(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  roster: readonly RosterMember[],
): BipedLife[] {
  const settled = nameLivesByElimination(nameLivesBySlot(lives, deaths, roster), deaths, roster);
  return nameLivesByElimination(nameLivesByRespawnOrder(settled, deaths, roster), deaths, roster);
}

function namedCount(lives: readonly BipedLife[]): number {
  return lives.filter((life) => life.xuid != null).length;
}

// each pass can unlock another, so the round repeats until no further life is named; a feed
// that cannot be aligned to the film clock is not used at all
function nameLives(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  roster: readonly RosterMember[],
): BipedLife[] {
  const byDeaths = nameLivesByDeaths(lives, deaths, roster);
  const filmDeaths = byDeaths.offsetMs == null ? [] : alignDeathsToFilm(deaths, byDeaths.offsetMs);
  const filmRoster = alignRosterToFilm(roster, byDeaths.offsetMs ?? 0);
  let named = byDeaths.lives;
  let before = -1;
  while (namedCount(named) !== before) {
    before = namedCount(named);
    named = namingRound(named, filmDeaths, filmRoster);
  }
  return named;
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
  const named = nameLives(buildLives(positions), rosterDeaths, roster);
  return {
    layout: decoded.layout,
    tracks: groupTracks(named, roster),
    unnamedLives: named.filter((life) => life.xuid == null),
  };
}

export function buildPlayerPositions(
  chunks: readonly ReplicationChunk[],
  matchStats: MatchStats,
  deaths: readonly DeathEvent[],
): PlayerPositions {
  return namePositions(decodePositions(chunks.map(walkChunk), matchStats), matchStats, deaths);
}
