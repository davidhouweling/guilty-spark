import type { MatchStats } from "halo-infinite-api";
import type { ReplicationChunk } from "../types";
import { datedFrames } from "../statborg/bit-reader";
import { detectAxisLayout } from "./axis-layout";
import { BipedRecordScanner } from "./biped-records";
import { bipedSlotBand } from "./keyframe-slots";
import {
  alignDeathsToFilm,
  bestDeathOffset,
  buildLives,
  nameLivesByDeaths,
  nameLivesByElimination,
  nameLivesByRespawnOrder,
  nameLivesBySlot,
} from "./lives";
import { dropIsolated, dropTeleports } from "./position-filters";
import { alignRosterToFilm, buildRoster } from "./roster";
import type { BipedLife, BipedPosition, DeathEvent, PlayerPositions, PlayerPositionTrack, RosterMember } from "./types";

export class PositionDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PositionDecodeError";
  }
}

export function scanChunkPositions(chunk: ReplicationChunk, scanner: BipedRecordScanner): BipedPosition[] {
  const positions: BipedPosition[] = [];
  for (const { timestampMs, payload } of datedFrames(chunk)) {
    for (const record of scanner.scan(payload)) {
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

function settle(lives: readonly BipedLife[], roster: readonly RosterMember[]): BipedLife[] {
  return nameLivesByElimination(nameLivesBySlot(lives), roster);
}

function nameLives(
  lives: readonly BipedLife[],
  deaths: readonly DeathEvent[],
  roster: readonly RosterMember[],
): BipedLife[] {
  const offsetMs = bestDeathOffset(lives, deaths);
  const filmDeaths = alignDeathsToFilm(deaths, offsetMs);
  const filmRoster = alignRosterToFilm(roster, offsetMs);
  const byDeaths = settle(nameLivesByDeaths(lives, filmDeaths, 0), filmRoster);
  return settle(nameLivesByRespawnOrder(byDeaths, filmDeaths, filmRoster), filmRoster);
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
  const scanner = new BipedRecordScanner(slots, layout);
  const raw: BipedPosition[] = [];
  for (const chunk of chunks) {
    for (const position of scanChunkPositions(chunk, scanner)) {
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
