import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";
import { authenticate } from "@xboxreplay/xboxlive-auth";
import type { MatchStats } from "halo-infinite-api";
import { GameVariantCategory } from "halo-infinite-api";
import { aFakeEnvWith } from "../../base/fakes/env.fake";
import { createFileBackedKVNamespace } from "../../base/fakes/namespace-to-file";
import { CustomSpartanTokenProvider } from "../../services/halo/custom-spartan-token-provider";
import { XboxService } from "../../services/xbox/xbox";
import type {
  FilmMetadataResponse,
  FilmTimelineOutput,
  HighlightEvent,
  HighlightEventType,
  KillPairing,
  KothHillTimeline,
  KothHillWindow,
  KothProgressPoint,
  PerfectCounts,
  PlayerValidation,
  ScoreTimelinePoint,
} from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HALO_PC_USER_AGENT = "SHIVA-2043073184/6.10021.18539.0 (release; PC)";
const MIN_XUID = 2_000_000_000_000_000n;
const MAX_XUID = 3_000_000_000_000_000n;
const EVENT_WINDOW_BITS = 20_000;
const EVENT_ENVELOPE_BYTES = 60;
const EVENT_TERMINATOR_BYTES = Uint8Array.of(0x00, 0x00, 0x2e, 0xe0);
const KILL_HINT = 50;
const DEATH_HINT = 20;
const MODE_HINT = 10;
const MEDAL_SORTING_WEIGHTS = new Set([50, 51, 52, 100, 101, 150, 200, 205, 210, 220, 225, 230, 235, 240, 245, 250]);
const KILL_DEATH_PAIRING_MAX_DELTA_MS = 1;
const PERFECT_MEDAL_NAME_ID = 1_512_363_953;
const PERFECTION_MEDAL_NAME_ID = 865_763_896;

interface AuthContext {
  authSource: "env" | "repo-auth";
  spartanToken: string;
  clearanceToken: string;
}

interface ParsedEventCounts {
  kills: number;
  deaths: number;
  medals: number;
}

let authContextPromise: Promise<AuthContext> | null = null;

function requireArg(value: string | undefined, label: string): string {
  if (value == null || value === "") {
    throw new Error(`Missing required ${label}`);
  }

  return value;
}

function createHeaders(spartanToken: string, clearanceToken?: string, acceptHeader = "application/json"): HeadersInit {
  return {
    Accept: acceptHeader,
    "Accept-Language": "en-US",
    "User-Agent": HALO_PC_USER_AGENT,
    "x-343-authorization-spartan": spartanToken,
    ...(clearanceToken == null ? {} : { "343-clearance": clearanceToken }),
  };
}

async function fetchJson<T>(url: string, spartanToken: string, clearanceToken?: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: createHeaders(spartanToken, clearanceToken),
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status.toString()} for ${url}`);
  }

  return response.json<T>();
}

async function fetchBinary(url: string, spartanToken: string, clearanceToken: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    method: "GET",
    headers: createHeaders(spartanToken, clearanceToken, "*/*"),
  });

  if (!response.ok) {
    throw new Error(`Chunk download failed with ${response.status.toString()} for ${url}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function resolveAuthContextUncached(): Promise<AuthContext> {
  const envSpartanToken = process.env["HALO_SPARTAN_TOKEN"] ?? process.env["SPARTAN_TOKEN"];
  const envClearanceToken = process.env["HALO_CLEARANCE_TOKEN"] ?? process.env["CLEARANCE_TOKEN"];
  if (envSpartanToken != null && envSpartanToken !== "" && envClearanceToken != null && envClearanceToken !== "") {
    return {
      authSource: "env",
      spartanToken: envSpartanToken,
      clearanceToken: envClearanceToken,
    };
  }

  const fakeNamespace = await createFileBackedKVNamespace(path.join(__dirname, "..", "film-auth-cache.json"));
  const env = aFakeEnvWith({
    APP_DATA: fakeNamespace,
    XBOX_USERNAME: requireArg(process.env.XBOX_USERNAME, "XBOX_USERNAME"),
    XBOX_PASSWORD: requireArg(process.env.XBOX_PASSWORD, "XBOX_PASSWORD"),
  });
  const xboxService = new XboxService({ env, authenticate });
  const tokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
  const spartanToken = await tokenProvider.getSpartanToken();

  const currentUser = await fetchJson<{ xuid: string }>(
    "https://comms.svc.halowaypoint.com:443/users/me",
    spartanToken,
  );

  const playerScopedClearanceUrl = [
    "https://settings.svc.halowaypoint.com:443/oban/flight-configurations/titles/hi/audiences/retail/players",
    `xuid(${currentUser.xuid})`,
    "active",
  ].join("/");

  try {
    const playerScopedClearance = await fetchJson<{ FlightConfigurationId: string }>(
      playerScopedClearanceUrl,
      spartanToken,
    );
    return {
      authSource: "repo-auth",
      spartanToken,
      clearanceToken: playerScopedClearance.FlightConfigurationId,
    };
  } catch {
    const fallbackClearance = await fetchJson<{ FlightConfigurationId: string }>(
      "https://settings.svc.halowaypoint.com:443/oban/flight-configurations/titles/hi/audiences/RETAIL/active",
      spartanToken,
    );
    return {
      authSource: "repo-auth",
      spartanToken,
      clearanceToken: fallbackClearance.FlightConfigurationId,
    };
  }
}

async function resolveAuthContext(): Promise<AuthContext> {
  if (authContextPromise != null) {
    return authContextPromise;
  }

  authContextPromise = resolveAuthContextUncached();
  return authContextPromise;
}

function getBit(data: Uint8Array, bitOffset: number): number {
  const byteIndex = Math.floor(bitOffset / 8);
  const bitIndex = 7 - (bitOffset % 8);
  const byte = data[byteIndex];
  if (byte == null) {
    return 0;
  }

  return (byte >> bitIndex) & 1;
}

function setBit(data: Uint8Array, bitOffset: number, bitValue: number): void {
  const byteIndex = Math.floor(bitOffset / 8);
  const bitIndex = 7 - (bitOffset % 8);
  const currentByte = data[byteIndex];
  if (currentByte == null) {
    return;
  }

  data[byteIndex] = currentByte | (bitValue << bitIndex);
}

function extractBitsToBytes(data: Uint8Array, startBit: number, bitLength: number): Uint8Array {
  const output = new Uint8Array(Math.ceil(bitLength / 8));
  for (let index = 0; index < bitLength; index += 1) {
    const bitValue = getBit(data, startBit + index);
    if (bitValue === 1) {
      setBit(output, index, bitValue);
    }
  }

  return output;
}

function readByteAtBitOffset(data: Uint8Array, startBit: number): number {
  return extractBitsToBytes(data, startBit, 8)[0] ?? 0;
}

function readLittleEndianUnsigned(data: Uint8Array, startBit: number, byteLength: number): bigint {
  const bytes = extractBitsToBytes(data, startBit, byteLength * 8);
  let value = 0n;
  for (let index = 0; index < bytes.length; index += 1) {
    value |= BigInt(bytes[index] ?? 0) << BigInt(index * 8);
  }

  return value;
}

function findPatternBitOffset(
  data: Uint8Array,
  startBit: number,
  endBitExclusive: number,
  pattern: Uint8Array,
): number | null {
  const patternBits = pattern.length * 8;
  const lastCandidate = endBitExclusive - patternBits;
  for (let candidateBit = startBit; candidateBit <= lastCandidate; candidateBit += 1) {
    let isMatch = true;
    for (let byteIndex = 0; byteIndex < pattern.length; byteIndex += 1) {
      if (readByteAtBitOffset(data, candidateBit + byteIndex * 8) !== pattern[byteIndex]) {
        isMatch = false;
        break;
      }
    }
    if (isMatch) {
      return candidateBit;
    }
  }

  return null;
}

function inferEventType(typeHint: number, isMedal: boolean): HighlightEventType {
  if (isMedal && MEDAL_SORTING_WEIGHTS.has(typeHint)) {
    return "medal";
  }
  if (typeHint === MODE_HINT) {
    return "mode";
  }
  if (typeHint === DEATH_HINT) {
    return "death";
  }
  if (typeHint === KILL_HINT) {
    return "kill";
  }

  throw new Error(`Unhandled event type with hint=${typeHint.toString()} and isMedal=${String(isMedal)}`);
}

function decodeUtf16Le(bytes: Uint8Array): string {
  let decoded = new TextDecoder("utf-16le").decode(bytes);
  while (decoded.endsWith("\u0000")) {
    decoded = decoded.slice(0, -1);
  }
  return decoded.trim();
}

function parseTimestampMs(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0, false);
}

function parseHighlightEvent(data: Uint8Array, xuidStartBit: number, filmMajorVersion: number): HighlightEvent | null {
  const eventWindowEndBit = Math.min(data.length * 8, xuidStartBit + EVENT_WINDOW_BITS);
  const eventTerminatorBit = findPatternBitOffset(data, xuidStartBit, eventWindowEndBit, EVENT_TERMINATOR_BYTES);
  if (eventTerminatorBit == null) {
    return null;
  }

  const envelopeStartBit = eventTerminatorBit - EVENT_ENVELOPE_BYTES * 8;
  if (envelopeStartBit < xuidStartBit) {
    return null;
  }

  const envelope = extractBitsToBytes(data, envelopeStartBit, EVENT_ENVELOPE_BYTES * 8);
  const usesExtendedLayout = filmMajorVersion <= 38 || filmMajorVersion >= 41;
  const gamertagStart = usesExtendedLayout ? 0 : 12;
  const gamertagEnd = gamertagStart + 32;
  const gamertag = decodeUtf16Le(envelope.subarray(gamertagStart, gamertagEnd));
  const [typeHint, isMedalByte, medalValue] = [envelope[47], envelope[55], envelope[59]];
  const timestampBytes = envelope.subarray(48, 52);

  // Extract weapon and headshot from envelope (currently unknown format, set to null for MVP)
  // TODO: Research film v41+ format to determine weaponId and headshot encoding
  const weaponId: number | null = null;
  const headshot: boolean | null = null;

  if (typeHint == null || isMedalByte == null || medalValue == null || timestampBytes.length !== 4 || gamertag === "") {
    return null;
  }

  const xuid = readLittleEndianUnsigned(data, xuidStartBit, 8);
  const isMedal = isMedalByte === 1;
  return {
    xuid: xuid.toString(),
    gamertag,
    typeHint,
    isMedal,
    eventType: inferEventType(typeHint, isMedal),
    timeMs: parseTimestampMs(timestampBytes),
    medalValue,
    teamId: null,
    weaponId,
    headshot,
  };
}

function parseHighlightEvents(chunkBytes: Uint8Array, filmMajorVersion: number): HighlightEvent[] {
  const decompressed = new Uint8Array(inflateSync(chunkBytes));
  const events: HighlightEvent[] = [];
  const seen = new Set<string>();
  const totalBits = decompressed.length * 8;

  for (let markerBit = 0; markerBit <= totalBits - 8; markerBit += 1) {
    if (readByteAtBitOffset(decompressed, markerBit) !== 0xc0) {
      continue;
    }
    const markerPrefixBit = markerBit - 8;
    if (markerPrefixBit < 0) {
      continue;
    }

    const markerPrefix = readByteAtBitOffset(decompressed, markerPrefixBit);
    if (markerPrefix !== 0x2d && markerPrefix !== 0x25) {
      continue;
    }

    const xuidStartBit = markerPrefixBit - 64;
    if (xuidStartBit < 0) {
      continue;
    }

    const xuid = readLittleEndianUnsigned(decompressed, xuidStartBit, 8);
    if (xuid <= MIN_XUID || xuid >= MAX_XUID) {
      continue;
    }

    const event = parseHighlightEvent(decompressed, xuidStartBit, filmMajorVersion);
    if (event == null) {
      continue;
    }

    const dedupeKey = [
      event.xuid,
      event.gamertag,
      event.eventType,
      event.timeMs.toString(),
      event.typeHint.toString(),
      event.medalValue.toString(),
    ].join(":");
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    events.push(event);
  }

  return events.sort((left, right) => left.timeMs - right.timeMs);
}

function unwrapPlayerId(playerId: string): string {
  const match = /^\w+\((\d+)\)$/u.exec(playerId);
  return match?.[1] ?? playerId;
}

function buildParsedCountsByXuid(events: HighlightEvent[]): Map<string, ParsedEventCounts> {
  const counts = new Map<string, ParsedEventCounts>();
  for (const event of events) {
    const current = counts.get(event.xuid) ?? { kills: 0, deaths: 0, medals: 0 };
    switch (event.eventType) {
      case "kill": {
        current.kills += 1;
        break;
      }
      case "death": {
        current.deaths += 1;
        break;
      }
      case "medal": {
        current.medals += 1;
        break;
      }
      case "mode": {
        break;
      }
      default: {
        throw new Error(`Unexpected event type: ${String(event.eventType)}`);
      }
    }
    counts.set(event.xuid, current);
  }

  return counts;
}

function buildPlayerValidations(matchStats: MatchStats, events: HighlightEvent[]): PlayerValidation[] {
  const parsedCountsByXuid = buildParsedCountsByXuid(events);

  return matchStats.Players.map((player) => {
    const xuid = unwrapPlayerId(player.PlayerId);
    const parsed = parsedCountsByXuid.get(xuid) ?? { kills: 0, deaths: 0, medals: 0 };
    let kills = 0;
    let deaths = 0;
    let medals = 0;
    for (const playerTeamStat of player.PlayerTeamStats) {
      kills += playerTeamStat.Stats.CoreStats.Kills;
      deaths += playerTeamStat.Stats.CoreStats.Deaths;
      medals += playerTeamStat.Stats.CoreStats.Medals.reduce((total, medal) => total + medal.Count, 0);
    }

    const gamertag = events.find((event) => event.xuid === xuid)?.gamertag ?? null;
    return {
      xuid,
      gamertag,
      teamId: player.LastTeamId,
      expected: { kills, deaths, medals },
      parsed,
    };
  }).filter(
    (player) =>
      player.gamertag != null || player.expected.kills > 0 || player.expected.deaths > 0 || player.expected.medals > 0,
  );
}

function buildTeamScoreTimeline(
  matchStats: MatchStats,
  events: HighlightEvent[],
  filmLengthMs: number,
): ScoreTimelinePoint[] {
  const teamScores: Record<string, number> = {};
  for (const team of matchStats.Teams) {
    teamScores[team.TeamId.toString()] = 0;
  }

  const timeline: ScoreTimelinePoint[] = [
    {
      timeMs: 0,
      teamScores: { ...teamScores },
      source: "initial",
      eventXuid: null,
    },
  ];

  for (const event of events) {
    if (event.eventType !== "kill" || event.teamId == null) {
      continue;
    }

    const teamKey = event.teamId.toString();
    teamScores[teamKey] = (teamScores[teamKey] ?? 0) + 1;
    timeline.push({
      timeMs: event.timeMs,
      teamScores: { ...teamScores },
      source: "parsed-kill",
      eventXuid: event.xuid,
    });
  }

  const parsedScoresDiffer = matchStats.Teams.some((team) => {
    const parsedScore = teamScores[team.TeamId.toString()] ?? 0;
    return parsedScore !== team.Stats.CoreStats.Score;
  });

  if (parsedScoresDiffer) {
    const finalScoreState: Record<string, number> = {};
    for (const team of matchStats.Teams) {
      finalScoreState[team.TeamId.toString()] = team.Stats.CoreStats.Score;
    }
    timeline.push({
      timeMs: filmLengthMs,
      teamScores: finalScoreState,
      source: "synthetic-final",
      eventXuid: null,
    });
  }

  return timeline;
}

function buildPlayerDisplayByXuid(
  matchStats: MatchStats,
  events: HighlightEvent[],
): Map<string, { gamertag: string | null; teamId: number | null }> {
  const players = new Map<string, { gamertag: string | null; teamId: number | null }>();

  for (const player of matchStats.Players) {
    const xuid = unwrapPlayerId(player.PlayerId);
    players.set(xuid, {
      gamertag: null,
      teamId: player.LastTeamId,
    });
  }

  for (const event of events) {
    const existing = players.get(event.xuid) ?? { gamertag: null, teamId: event.teamId };
    players.set(event.xuid, {
      gamertag: existing.gamertag ?? event.gamertag,
      teamId: existing.teamId ?? event.teamId,
    });
  }

  return players;
}

function classifyKillPair(
  killerTeamId: number | null,
  killerXuid: string,
  victimTeamId: number | null,
  victimXuid: string,
): KillPairing["classification"] {
  if (killerXuid === victimXuid) {
    return "suicide";
  }

  if (killerTeamId != null && victimTeamId != null && killerTeamId === victimTeamId) {
    return "betrayal";
  }

  return "enemy-kill";
}

function buildKillMatrixAnalytics(
  matchStats: MatchStats,
  kills: HighlightEvent[],
  deaths: HighlightEvent[],
  events: HighlightEvent[],
): FilmTimelineOutput["analytics"]["killMatrix"] {
  const playersByXuid = buildPlayerDisplayByXuid(matchStats, events);
  const orderedKills = [...kills].sort((left, right) => left.timeMs - right.timeMs);
  const orderedDeaths = [...deaths].sort((left, right) => left.timeMs - right.timeMs);
  const usedDeathIndexes = new Set<number>();
  const pairings: KillPairing[] = [];

  for (const killEvent of orderedKills) {
    let bestDeathIndex: number | null = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (let deathIndex = 0; deathIndex < orderedDeaths.length; deathIndex += 1) {
      if (usedDeathIndexes.has(deathIndex)) {
        continue;
      }

      const deathEvent = orderedDeaths[deathIndex];
      if (deathEvent == null) {
        continue;
      }
      const delta = deathEvent.timeMs - killEvent.timeMs;
      const absoluteDelta = Math.abs(delta);
      if (absoluteDelta > KILL_DEATH_PAIRING_MAX_DELTA_MS) {
        continue;
      }

      if (absoluteDelta < Math.abs(bestDelta)) {
        bestDelta = delta;
        bestDeathIndex = deathIndex;
      }
    }

    if (bestDeathIndex == null) {
      continue;
    }

    usedDeathIndexes.add(bestDeathIndex);
    const deathEvent = orderedDeaths[bestDeathIndex];
    if (deathEvent == null) {
      continue;
    }
    pairings.push({
      timeMs: killEvent.timeMs,
      killerXuid: killEvent.xuid,
      killerGamertag: killEvent.gamertag,
      killerTeamId: killEvent.teamId,
      victimXuid: deathEvent.xuid,
      victimGamertag: deathEvent.gamertag,
      victimTeamId: deathEvent.teamId,
      timeDeltaMs: bestDelta,
      classification: classifyKillPair(killEvent.teamId, killEvent.xuid, deathEvent.teamId, deathEvent.xuid),
      weaponId: killEvent.weaponId,
      headshot: killEvent.headshot,
    });
  }

  // Build kill matrix as flat pair aggregates keyed by killer and victim.
  const matrixByPair = new Map<string, FilmTimelineOutput["analytics"]["killMatrix"]["entries"][number]>();
  for (const pairing of pairings) {
    const key = `${pairing.killerXuid}:${pairing.victimXuid}`;
    const existing = matrixByPair.get(key);
    if (existing == null) {
      const weapons: { weaponId: number; count: number }[] = [];
      if (pairing.weaponId != null) {
        weapons.push({ weaponId: pairing.weaponId, count: 1 });
      }

      matrixByPair.set(key, {
        killerXuid: pairing.killerXuid,
        victimXuid: pairing.victimXuid,
        count: 1,
        headshotKills: pairing.headshot === true ? 1 : 0,
        perfects: 0,
        weapons,
      });
      continue;
    }

    existing.count += 1;
    if (pairing.headshot === true) {
      existing.headshotKills += 1;
    }

    if (pairing.weaponId != null) {
      const weapon = existing.weapons.find((current) => current.weaponId === pairing.weaponId);
      if (weapon == null) {
        existing.weapons.push({ weaponId: pairing.weaponId, count: 1 });
      } else {
        weapon.count += 1;
      }
    }
  }

  const unpairedDeathsByXuid = new Map<string, number>();
  for (let deathIndex = 0; deathIndex < orderedDeaths.length; deathIndex += 1) {
    if (usedDeathIndexes.has(deathIndex)) {
      continue;
    }

    const deathEvent = orderedDeaths[deathIndex];
    if (deathEvent == null) {
      continue;
    }
    unpairedDeathsByXuid.set(deathEvent.xuid, (unpairedDeathsByXuid.get(deathEvent.xuid) ?? 0) + 1);
  }

  return {
    entries: [...matrixByPair.values()].sort((left, right) => {
      if (left.killerXuid !== right.killerXuid) {
        return left.killerXuid.localeCompare(right.killerXuid);
      }
      return left.victimXuid.localeCompare(right.victimXuid);
    }),
    pairings,
    unpairedDeaths: [...unpairedDeathsByXuid.entries()].map(([xuid, count]) => {
      const player = playersByXuid.get(xuid);
      return {
        xuid,
        gamertag: player?.gamertag ?? null,
        teamId: player?.teamId ?? null,
        count,
      };
    }),
  };
}

function buildPerfectCounts(
  matchStats: MatchStats,
  events: HighlightEvent[],
): FilmTimelineOutput["analytics"]["perfects"] {
  const playersByXuid = buildPlayerDisplayByXuid(matchStats, events);
  const output: PerfectCounts[] = [];

  for (const player of matchStats.Players) {
    const xuid = unwrapPlayerId(player.PlayerId);
    let perfects = 0;
    let perfections = 0;

    for (const playerTeamStat of player.PlayerTeamStats) {
      for (const medal of playerTeamStat.Stats.CoreStats.Medals) {
        if (medal.NameId === PERFECT_MEDAL_NAME_ID) {
          perfects += medal.Count;
        }
        if (medal.NameId === PERFECTION_MEDAL_NAME_ID) {
          perfections += medal.Count;
        }
      }
    }

    output.push({
      xuid,
      gamertag: playersByXuid.get(xuid)?.gamertag ?? null,
      teamId: playersByXuid.get(xuid)?.teamId ?? null,
      perfects,
      perfections,
    });
  }

  const totals = output.reduce(
    (current, player) => ({
      perfects: current.perfects + player.perfects,
      perfections: current.perfections + player.perfections,
    }),
    { perfects: 0, perfections: 0 },
  );

  return {
    perfectMedalNameId: PERFECT_MEDAL_NAME_ID,
    perfectionMedalNameId: PERFECTION_MEDAL_NAME_ID,
    totals,
    players: output,
  };
}

const KOTH_TICKS_PER_POINT = 8;

function buildKothHillTimeline(modeEvents: HighlightEvent[]): KothHillTimeline {
  const sorted = [...modeEvents]
    .filter((event): event is HighlightEvent & { teamId: number } => event.teamId != null)
    .sort((left, right) => left.timeMs - right.timeMs);

  const hills: KothHillWindow[] = [];
  const teamTicks: Record<string, number> = {};
  let hillIndex = 0;
  let hillStartMs = sorted[0]?.timeMs ?? 0;
  let progressPoints: KothProgressPoint[] = [];

  for (const event of sorted) {
    const teamKey = event.teamId.toString();
    teamTicks[teamKey] = (teamTicks[teamKey] ?? 0) + 1;
    const cumulative = teamTicks[teamKey] ?? 1;

    progressPoints.push({
      timeMs: event.timeMs,
      xuid: event.xuid,
      gamertag: event.gamertag,
      teamId: event.teamId,
      teamCumulativeTicks: cumulative,
    });

    if (cumulative >= KOTH_TICKS_PER_POINT) {
      hills.push({
        hillIndex,
        startTimeMs: hillStartMs,
        endTimeMs: event.timeMs,
        scoredByTeamId: event.teamId,
        scoredAtMs: event.timeMs,
        progressPoints,
      });
      hillIndex += 1;
      hillStartMs = event.timeMs;
      progressPoints = [];
      for (const key of Object.keys(teamTicks)) {
        teamTicks[key] = 0;
      }
    }
  }

  if (progressPoints.length > 0) {
    hills.push({
      hillIndex,
      startTimeMs: hillStartMs,
      endTimeMs: null,
      scoredByTeamId: null,
      scoredAtMs: null,
      progressPoints,
    });
  }

  return { ticksPerPoint: KOTH_TICKS_PER_POINT, hills };
}

function buildLimitations(matchStats: MatchStats): string[] {
  const limitations = [
    "Only highlight-events chunk parsing is implemented in this proof of concept.",
    "Exact alive-player timeline is not included because spawn and respawn state are not decoded yet.",
    "Mode-specific events are emitted as raw markers only; their semantic meaning still needs reverse engineering.",
  ];

  switch (matchStats.MatchInfo.GameVariantCategory) {
    case GameVariantCategory.MultiplayerSlayer: {
      limitations.push(
        "Score progression is derived from parsed kill events and may miss rare events that do not appear in the highlight chunk.",
      );
      break;
    }
    case GameVariantCategory.MultiplayerCtf: {
      limitations.push(
        "CTF progression is not reconstructed yet because flag event semantics are not decoded from mode markers.",
      );
      break;
    }
    case GameVariantCategory.MultiplayerKingOfTheHill: {
      limitations.push(
        "King of the Hill hill progression is reconstructed as a heuristic from mode event ticks (~5s uncontested occupation = 1 tick, 8 ticks = 1 point). Contest periods produce no ticks and are inferred from gaps.",
      );
      break;
    }
    case GameVariantCategory.MultiplayerStrongholds: {
      limitations.push(
        "Strongholds zone ownership and contested-state timing are not reconstructed yet from film data.",
      );
      break;
    }
    case GameVariantCategory.MultiplayerOddball: {
      limitations.push("Oddball round progression and possession timing are not reconstructed yet from film data.");
      break;
    }
    case GameVariantCategory.MultiplayerAttrition:
    case GameVariantCategory.MultiplayerElimination:
    case GameVariantCategory.MultiplayerFiesta:
    case GameVariantCategory.MultiplayerTotalControl:
    case GameVariantCategory.MultiplayerExtraction:
    case GameVariantCategory.MultiplayerStockpile:
    case GameVariantCategory.MultiplayerInfection:
    case GameVariantCategory.MultiplayerVIP:
    case GameVariantCategory.MultiplayerEscalation:
    case GameVariantCategory.MultiplayerGrifball:
    case GameVariantCategory.MultiplayerLandGrab:
    case GameVariantCategory.MultiplayerMinigame:
    case GameVariantCategory.MultiplayerFirefight: {
      limitations.push("This mode does not yet have a dedicated progression builder in the proof of concept.");
      break;
    }
    default: {
      throw new Error("Unhandled game variant category");
    }
  }

  return limitations;
}

export async function extractFilmTimeline(matchId: string): Promise<FilmTimelineOutput> {
  const authContext = await resolveAuthContext();
  const [matchStats, filmMetadata] = await Promise.all([
    fetchJson<MatchStats>(
      `https://halostats.svc.halowaypoint.com:443/hi/matches/${matchId}/stats`,
      authContext.spartanToken,
    ),
    fetchJson<FilmMetadataResponse>(
      `https://discovery-infiniteugc.svc.halowaypoint.com:443/hi/films/matches/${matchId}/spectate`,
      authContext.spartanToken,
      authContext.clearanceToken,
    ),
  ]);

  const highlightChunk =
    [...filmMetadata.CustomData.Chunks]
      .sort((left, right) => left.Index - right.Index)
      .findLast((chunk) => chunk.ChunkType === 3) ?? null;

  if (highlightChunk == null) {
    throw new Error(`No highlight-events chunk found for match ${matchId}`);
  }

  const highlightChunkPath = highlightChunk.FileRelativePath.replace(/^\//u, "");
  const highlightChunkUrl = `${filmMetadata.BlobStoragePathPrefix}${highlightChunkPath}`;
  const highlightChunkBytes = await fetchBinary(
    highlightChunkUrl,
    authContext.spartanToken,
    authContext.clearanceToken,
  );
  const xuidToTeamId = new Map<string, number>();
  for (const player of matchStats.Players) {
    xuidToTeamId.set(unwrapPlayerId(player.PlayerId), player.LastTeamId);
  }

  const events = parseHighlightEvents(highlightChunkBytes, filmMetadata.CustomData.FilmMajorVersion).map((event) => ({
    ...event,
    teamId: xuidToTeamId.get(event.xuid) ?? null,
  }));

  const validations = buildPlayerValidations(matchStats, events);
  const timelineEvents = {
    kills: events.filter((event) => event.eventType === "kill"),
    deaths: events.filter((event) => event.eventType === "death"),
    medals: events.filter((event) => event.eventType === "medal"),
    mode: events.filter((event) => event.eventType === "mode"),
  };

  const teamScoreTimeline: ScoreTimelinePoint[] =
    matchStats.MatchInfo.GameVariantCategory === GameVariantCategory.MultiplayerSlayer
      ? buildTeamScoreTimeline(matchStats, events, filmMetadata.CustomData.FilmLength)
      : [
          {
            timeMs: 0,
            teamScores: Object.fromEntries(matchStats.Teams.map((team) => [team.TeamId.toString(), 0])),
            source: "initial",
            eventXuid: null,
          },
        ];

  const kothHills: KothHillTimeline | null =
    matchStats.MatchInfo.GameVariantCategory === GameVariantCategory.MultiplayerKingOfTheHill
      ? buildKothHillTimeline(timelineEvents.mode)
      : null;

  const killMatrix = buildKillMatrixAnalytics(matchStats, timelineEvents.kills, timelineEvents.deaths, events);
  const perfects = buildPerfectCounts(matchStats, events);

  return {
    extractedAt: new Date().toISOString(),
    authSource: authContext.authSource,
    match: {
      matchId: matchStats.MatchId,
      gameVariantCategory: matchStats.MatchInfo.GameVariantCategory,
      teams: matchStats.Teams.map((team) => ({
        teamId: team.TeamId,
        outcome: team.Outcome,
        rank: team.Rank,
        finalScore: team.Stats.CoreStats.Score,
        roundsWon: team.Stats.CoreStats.RoundsWon,
        kills: team.Stats.CoreStats.Kills,
        deaths: team.Stats.CoreStats.Deaths,
      })),
      players: matchStats.Players.map((player) => ({
        xuid: unwrapPlayerId(player.PlayerId),
        teamId: player.LastTeamId,
        kills: player.PlayerTeamStats.reduce(
          (total, playerTeamStat) => total + playerTeamStat.Stats.CoreStats.Kills,
          0,
        ),
        deaths: player.PlayerTeamStats.reduce(
          (total, playerTeamStat) => total + playerTeamStat.Stats.CoreStats.Deaths,
          0,
        ),
        medals: player.PlayerTeamStats.reduce(
          (total, playerTeamStat) =>
            total + playerTeamStat.Stats.CoreStats.Medals.reduce((medalTotal, medal) => medalTotal + medal.Count, 0),
          0,
        ),
      })),
    },
    film: {
      assetId: filmMetadata.AssetId,
      filmMajorVersion: filmMetadata.CustomData.FilmMajorVersion,
      filmLengthMs: filmMetadata.CustomData.FilmLength,
      highlightChunkIndex: highlightChunk.Index,
      chunks: filmMetadata.CustomData.Chunks.map((chunk) => ({
        index: chunk.Index,
        chunkType: chunk.ChunkType,
        durationMs: chunk.DurationMilliseconds,
        sizeBytes: chunk.ChunkSize,
        path: chunk.FileRelativePath,
      })),
    },
    events,
    timelines: {
      teamScore: teamScoreTimeline,
      kills: timelineEvents.kills,
      deaths: timelineEvents.deaths,
      medals: timelineEvents.medals,
      mode: timelineEvents.mode,
      kothHills,
    },
    validation: {
      players: validations,
      parsedCounts: {
        kills: timelineEvents.kills.length,
        deaths: timelineEvents.deaths.length,
        medals: timelineEvents.medals.length,
        mode: timelineEvents.mode.length,
      },
    },
    analytics: {
      killMatrix,
      perfects,
    },
    limitations: buildLimitations(matchStats),
  };
}
