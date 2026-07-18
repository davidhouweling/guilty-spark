import { inflateSync } from "node:zlib";
import type { MatchStats } from "halo-infinite-api";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { wrapXuid, unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import type { FireEvent } from "./halo-film-type2";
import { scanFireEvents, WeaponAttributor } from "./halo-film-type2";
import {
  HALO_PC_USER_AGENT,
  MIN_XUID,
  MAX_XUID,
  EVENT_WINDOW_BITS,
  EVENT_ENVELOPE_BYTES,
  EVENT_TERMINATOR_BYTES,
  KILL_HINT,
  DEATH_HINT,
  MODE_HINT,
  MEDAL_SORTING_WEIGHTS,
  KILL_DEATH_PAIRING_MAX_DELTA_MS,
  PERFECT_MEDAL_NAME_ID,
  PERFECT_MEDAL_PAIRING_MAX_DELTA_MS,
} from "./constants";
import type {
  FilmMetadataResponse,
  ParsedHighlightEvent,
  KillMatrixEntry,
  KillMatrixAnalytics,
  KillRaceDeathEvent,
  KillRaceProgression,
  KillRaceProgressionEvent,
  HaloFilmServiceOpts,
} from "./types";
import type { CustomSpartanTokenProvider } from "./custom-spartan-token-provider";

export class HaloFilmService {
  private static readonly FILM_CACHE_TTL_SECONDS = 604_800;
  private static readonly CLEARANCE_CACHE_KEY = "film:clearance";
  private static readonly CLEARANCE_CACHE_TTL_SECONDS = 3_600;
  private static readonly FILM_CACHE_BASE_URL = "https://halo-film-cache.local";

  private readonly env: Env;
  private readonly spartanTokenProvider: CustomSpartanTokenProvider;
  private readonly fetchFn: typeof globalThis.fetch | undefined;

  constructor({ env, spartanTokenProvider, fetch: fetchFn }: HaloFilmServiceOpts) {
    this.env = env;
    this.spartanTokenProvider = spartanTokenProvider;
    this.fetchFn = fetchFn;
  }

  private async callFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return this.fetchFn != null ? this.fetchFn(input, init) : fetch(input, init);
  }

  async getHighlightEventsForMatch(matchId: string): Promise<ParsedHighlightEvent[]> {
    const kvCacheKey = `halo:film:match:${matchId}`;
    const kvCached = await this.env.APP_DATA.get<ParsedHighlightEvent[]>(kvCacheKey, "json");
    if (kvCached != null) {
      return kvCached;
    }

    const events = await this.fetchHighlightEventsForMatch(matchId);

    await this.env.APP_DATA.put(kvCacheKey, JSON.stringify(events), {
      expirationTtl: HaloFilmService.FILM_CACHE_TTL_SECONDS,
    });

    return events;
  }

  private async fetchHighlightEventsForMatch(matchId: string): Promise<ParsedHighlightEvent[]> {
    const metadataCacheRequest = this.toMetadataCacheRequest(matchId);
    const cachedMetadata = await this.getCachedJson<FilmMetadataResponse>(metadataCacheRequest);
    const cachedHighlightChunk = cachedMetadata == null ? null : this.tryFindHighlightChunk(cachedMetadata);
    if (cachedMetadata != null) {
      if (cachedHighlightChunk != null) {
        const chunkCacheRequest = this.toChunkCacheRequest(matchId, cachedHighlightChunk.Index);
        const cachedChunk = await this.getCachedChunk(chunkCacheRequest);
        if (cachedChunk != null) {
          return this.parseHighlightEvents(cachedChunk, cachedMetadata.CustomData.FilmMajorVersion);
        }
      }
    }

    if (cachedMetadata != null && cachedHighlightChunk == null) {
      await caches.default.delete(metadataCacheRequest);
    }

    const authContext = await this.resolveAuthContext();
    const filmMetadata =
      cachedMetadata != null && cachedHighlightChunk != null
        ? cachedMetadata
        : await this.getOrFetchFilmMetadata(matchId, authContext);
    const highlightChunkBytes = await this.getOrFetchHighlightChunkBytes(matchId, filmMetadata, authContext);
    return this.parseHighlightEvents(highlightChunkBytes, filmMetadata.CustomData.FilmMajorVersion);
  }

  private async loadEnrichedEventsForMatch(matchStats: MatchStats): Promise<ParsedHighlightEvent[]> {
    const events = await this.getHighlightEventsForMatch(matchStats.MatchId);
    const xuidToTeamId = this.buildXuidToTeamMap(matchStats);
    this.assignTeamIdsToEvents(events, xuidToTeamId);
    return events;
  }

  async buildKillRaceProgression(matchStats: MatchStats): Promise<KillRaceProgression> {
    const events = await this.loadEnrichedEventsForMatch(matchStats);
    const kills = this.filterKillEvents(events);
    const knownTeamIds = new Set<number>(matchStats.Teams.map((team) => team.TeamId));
    const runningScores = new Map<number, number>([...knownTeamIds].map((id) => [id, 0]));
    const progressionEvents: KillRaceProgressionEvent[] = [];

    for (const kill of kills) {
      if (kill.teamId == null || !runningScores.has(kill.teamId)) {
        continue;
      }
      runningScores.set(kill.teamId, Preconditions.checkExists(runningScores.get(kill.teamId)) + 1);
      progressionEvents.push({
        timestampMs: kill.timeMs,
        teamId: kill.teamId,
        runningScores: Object.fromEntries(runningScores),
      });
    }

    return {
      events: progressionEvents,
      deathTimeline: this.buildDeathTimeline(events, knownTeamIds),
      teamCount: runningScores.size,
    };
  }

  private buildDeathTimeline(events: ParsedHighlightEvent[], knownTeamIds: ReadonlySet<number>): KillRaceDeathEvent[] {
    const timeline: KillRaceDeathEvent[] = [];
    for (const event of events) {
      if (event.eventType === "death" && event.teamId != null && knownTeamIds.has(event.teamId)) {
        timeline.push({ timestampMs: event.timeMs, teamId: event.teamId });
      }
    }
    return timeline;
  }

  async buildKillMatrixAnalytics(matchStats: MatchStats): Promise<KillMatrixAnalytics> {
    const events = await this.loadEnrichedEventsForMatch(matchStats);

    const kills = this.filterKillEvents(events);
    const deaths = events.filter((event) => event.eventType === "death");
    const perfectMedalTimestamps = this.buildPerfectMedalTimestampsByXuid(events);
    const perfectCounts = this.buildPerfectCountsReport(events);

    const xuidToPlayerIndex = this.buildXuidToPlayerIndex(matchStats);
    const weaponAttributor = await this.tryBuildWeaponAttributor(matchStats);

    const { entries, maxTimeDeltaMs, usedDeathCount } = this.buildKillMatrixEntriesByPairing(
      kills,
      deaths,
      perfectMedalTimestamps,
      weaponAttributor,
      xuidToPlayerIndex,
    );

    return {
      entries,
      pairingQuality: {
        unpairedDeathCount: deaths.length - usedDeathCount,
        maxTimeDeltaMs,
      },
      perfectCounts,
    };
  }

  private filterKillEvents(events: ParsedHighlightEvent[]): ParsedHighlightEvent[] {
    return events.filter((event) => event.eventType === "kill");
  }

  private buildXuidToPlayerIndex(matchStats: MatchStats): Map<string, number> {
    const sorted = [...matchStats.Players].sort((a, b) => a.LastTeamId - b.LastTeamId || a.Rank - b.Rank);
    const map = new Map<string, number>();
    for (const [index, player] of sorted.entries()) {
      map.set(unwrapXuid(player.PlayerId), index);
    }
    return map;
  }

  private async tryBuildWeaponAttributor(matchStats: MatchStats): Promise<WeaponAttributor | null> {
    try {
      const authContext = await this.resolveAuthContext();
      const filmMetadata = await this.getOrFetchFilmMetadata(matchStats.MatchId, authContext);
      const fireEvents = await this.scanAllReplicationChunks(matchStats.MatchId, filmMetadata, authContext);
      if (fireEvents == null) {
        return null;
      }
      return new WeaponAttributor(fireEvents);
    } catch {
      return null;
    }
  }

  private findReplicationChunksWithStartMs(
    filmMetadata: FilmMetadataResponse,
  ): { chunk: FilmMetadataResponse["CustomData"]["Chunks"][number]; startMs: number }[] {
    const sorted = [...filmMetadata.CustomData.Chunks].sort((a, b) => a.Index - b.Index);
    const results: { chunk: FilmMetadataResponse["CustomData"]["Chunks"][number]; startMs: number }[] = [];
    let cumulativeMs = 0;
    for (const chunk of sorted) {
      if (chunk.ChunkType === 2) {
        results.push({ chunk, startMs: cumulativeMs });
      }
      cumulativeMs += chunk.DurationMilliseconds;
    }
    return results;
  }

  private async scanAllReplicationChunks(
    matchId: string,
    filmMetadata: FilmMetadataResponse,
    authContext: { spartanToken: string; clearanceToken: string },
  ): Promise<FireEvent[] | null> {
    const chunks = this.findReplicationChunksWithStartMs(filmMetadata);
    if (chunks.length === 0) {
      return null;
    }
    const allFireEvents: FireEvent[] = [];
    for (const { chunk, startMs } of chunks) {
      const chunkCacheRequest = this.toChunkCacheRequest(matchId, chunk.Index);
      let chunkBytes = await this.getCachedChunk(chunkCacheRequest);
      if (chunkBytes == null) {
        const path = chunk.FileRelativePath.replace(/^\//u, "");
        const url = `${filmMetadata.BlobStoragePathPrefix}${path}`;
        chunkBytes = await this.fetchBinary(url, authContext.spartanToken, authContext.clearanceToken);
        await this.putCachedChunk(chunkCacheRequest, chunkBytes);
      }
      allFireEvents.push(...scanFireEvents(chunkBytes, startMs, chunk.DurationMilliseconds));
    }
    return allFireEvents;
  }

  private async getOrFetchFilmMetadata(
    matchId: string,
    authContext: { spartanToken: string; clearanceToken: string },
  ): Promise<FilmMetadataResponse> {
    const metadataCacheRequest = this.toMetadataCacheRequest(matchId);
    let filmMetadata = await this.getCachedJson<FilmMetadataResponse>(metadataCacheRequest);
    if (filmMetadata == null) {
      filmMetadata = await this.fetchJson<FilmMetadataResponse>(
        `https://discovery-infiniteugc.svc.halowaypoint.com:443/hi/films/matches/${matchId}/spectate`,
        authContext.spartanToken,
        authContext.clearanceToken,
      );
      await this.putCachedJson(metadataCacheRequest, filmMetadata);
    }
    return filmMetadata;
  }

  private findHighlightChunk(
    matchId: string,
    filmMetadata: FilmMetadataResponse,
  ): FilmMetadataResponse["CustomData"]["Chunks"][number] {
    const highlightChunk = this.tryFindHighlightChunk(filmMetadata);

    if (highlightChunk == null) {
      throw new Error(`No highlight chunk found for match ${matchId}`);
    }

    return highlightChunk;
  }

  private tryFindHighlightChunk(
    filmMetadata: FilmMetadataResponse,
  ): FilmMetadataResponse["CustomData"]["Chunks"][number] | null {
    return (
      [...filmMetadata.CustomData.Chunks]
        .sort((left, right) => left.Index - right.Index)
        .findLast((chunk) => chunk.ChunkType === 3) ?? null
    );
  }

  private async getOrFetchHighlightChunkBytes(
    matchId: string,
    filmMetadata: FilmMetadataResponse,
    authContext: { spartanToken: string; clearanceToken: string },
  ): Promise<Uint8Array> {
    const highlightChunk = this.findHighlightChunk(matchId, filmMetadata);
    const chunkCacheRequest = this.toChunkCacheRequest(matchId, highlightChunk.Index);
    const cachedChunk = await this.getCachedChunk(chunkCacheRequest);
    if (cachedChunk != null) {
      return cachedChunk;
    }

    const highlightChunkPath = highlightChunk.FileRelativePath.replace(/^\//u, "");
    const highlightChunkUrl = `${filmMetadata.BlobStoragePathPrefix}${highlightChunkPath}`;
    const downloadedChunk = await this.fetchBinary(
      highlightChunkUrl,
      authContext.spartanToken,
      authContext.clearanceToken,
    );
    await this.putCachedChunk(chunkCacheRequest, downloadedChunk);
    return downloadedChunk;
  }

  private buildXuidToTeamMap(matchStats: MatchStats): Map<string, number> {
    const map = new Map<string, number>();
    for (const player of matchStats.Players) {
      const xuid = unwrapXuid(player.PlayerId);
      map.set(xuid, player.LastTeamId);
    }
    return map;
  }

  private assignTeamIdsToEvents(events: ParsedHighlightEvent[], xuidToTeamId: Map<string, number>): void {
    for (const event of events) {
      event.teamId = xuidToTeamId.get(event.xuid) ?? null;
    }
  }

  private buildPerfectMedalTimestampsByXuid(events: ParsedHighlightEvent[]): Map<string, number[]> {
    const timestampsByXuid = new Map<string, number[]>();
    for (const event of events) {
      if (event.eventType !== "medal" || event.medalValue !== PERFECT_MEDAL_NAME_ID) {
        continue;
      }
      let timestamps = timestampsByXuid.get(event.xuid);
      if (timestamps == null) {
        timestamps = [];
        timestampsByXuid.set(event.xuid, timestamps);
      }
      timestamps.push(event.timeMs);
    }
    return timestampsByXuid;
  }

  private buildKillMatrixEntriesByPairing(
    kills: ParsedHighlightEvent[],
    deaths: ParsedHighlightEvent[],
    perfectMedalTimestamps: Map<string, number[]>,
    weaponAttributor: WeaponAttributor | null,
    xuidToPlayerIndex: Map<string, number>,
  ): { entries: KillMatrixEntry[]; maxTimeDeltaMs: number; usedDeathCount: number } {
    const entriesByPair = new Map<string, KillMatrixEntry>();
    const weaponCountsByPair = new Map<string, Map<string, { name: string; count: number }>>();
    const usedDeathIndexes = new Set<number>();
    let maxTimeDeltaMs = 0;

    for (const killEvent of kills) {
      if (killEvent.teamId == null) {
        continue;
      }

      const deathIndex = this.findBestDeathMatch(killEvent, deaths, usedDeathIndexes);
      if (deathIndex < 0) {
        continue;
      }

      const deathEvent = Preconditions.checkExists(deaths[deathIndex]);
      usedDeathIndexes.add(deathIndex);
      const timeDelta = Math.abs(killEvent.timeMs - deathEvent.timeMs);
      maxTimeDeltaMs = Math.max(maxTimeDeltaMs, timeDelta);

      const pairKey = `${killEvent.xuid}:${deathEvent.xuid}`;
      const existing = entriesByPair.get(pairKey) ?? {
        killerXuid: killEvent.xuid,
        victimXuid: deathEvent.xuid,
        count: 0,
        headshotKills: 0,
        perfects: 0,
        weapons: [],
      };
      existing.count += 1;
      if (this.consumePerfectMedalForKill(perfectMedalTimestamps, killEvent.xuid, killEvent.timeMs)) {
        existing.perfects += 1;
      }
      entriesByPair.set(pairKey, existing);

      if (weaponAttributor != null) {
        const playerIndex = xuidToPlayerIndex.get(killEvent.xuid) ?? null;
        const weapon = weaponAttributor.claim(playerIndex, killEvent.timeMs);
        if (weapon != null) {
          let pairWeapons = weaponCountsByPair.get(pairKey);
          if (pairWeapons == null) {
            pairWeapons = new Map();
            weaponCountsByPair.set(pairKey, pairWeapons);
          }
          const existingWeapon = pairWeapons.get(weapon.weaponId);
          if (existingWeapon != null) {
            existingWeapon.count += 1;
          } else {
            pairWeapons.set(weapon.weaponId, { name: weapon.name, count: 1 });
          }
        }
      }
    }

    for (const [pairKey, entry] of entriesByPair) {
      const pairWeapons = weaponCountsByPair.get(pairKey);
      if (pairWeapons != null) {
        entry.weapons = Array.from(pairWeapons.entries())
          .map(([weaponId, { name, count }]) => ({ weaponId, name, count }))
          .sort((a, b) => b.count - a.count);
      }
    }

    return { entries: Array.from(entriesByPair.values()), maxTimeDeltaMs, usedDeathCount: usedDeathIndexes.size };
  }

  private consumePerfectMedalForKill(
    timestampsByXuid: Map<string, number[]>,
    killerXuid: string,
    killTimeMs: number,
  ): boolean {
    const timestamps = timestampsByXuid.get(killerXuid);
    if (timestamps == null) {
      return false;
    }
    let bestIndex = -1;
    let bestDelta = Infinity;
    for (const [i, ts] of timestamps.entries()) {
      const delta = Math.abs(ts - killTimeMs);
      if (delta <= PERFECT_MEDAL_PAIRING_MAX_DELTA_MS && delta < bestDelta) {
        bestIndex = i;
        bestDelta = delta;
      }
    }
    if (bestIndex < 0) {
      return false;
    }
    timestamps.splice(bestIndex, 1);
    return true;
  }

  private findBestDeathMatch(
    killEvent: ParsedHighlightEvent,
    deaths: ParsedHighlightEvent[],
    usedDeathIndexes: Set<number>,
  ): number {
    let bestDeathIndex = -1;
    let bestTimeDelta = Infinity;

    for (let deathIndex = 0; deathIndex < deaths.length; deathIndex += 1) {
      if (usedDeathIndexes.has(deathIndex)) {
        continue;
      }

      const deathEvent = deaths[deathIndex];
      if (deathEvent?.teamId == null) {
        continue;
      }

      const timeDelta = Math.abs(killEvent.timeMs - deathEvent.timeMs);
      if (timeDelta <= KILL_DEATH_PAIRING_MAX_DELTA_MS && timeDelta < bestTimeDelta) {
        bestDeathIndex = deathIndex;
        bestTimeDelta = timeDelta;
      }
    }

    return bestDeathIndex;
  }

  private buildPerfectCountsReport(events: ParsedHighlightEvent[]): {
    total: number;
    byXuid: Record<string, number>;
  } {
    const byXuid: Record<string, number> = {};
    let total = 0;
    for (const event of events) {
      if (event.eventType !== "medal" || event.medalValue !== PERFECT_MEDAL_NAME_ID) {
        continue;
      }
      byXuid[event.xuid] = (byXuid[event.xuid] ?? 0) + 1;
      total += 1;
    }
    return { total, byXuid };
  }

  private createHeaders(spartanToken: string, clearanceToken?: string, acceptOverride?: string): HeadersInit {
    const headers: Record<string, string> = {
      Accept: acceptOverride ?? "application/json",
      "Accept-Language": "en-US",
      "User-Agent": HALO_PC_USER_AGENT,
      "x-343-authorization-spartan": spartanToken,
    };
    if (clearanceToken != null) {
      headers["343-clearance"] = clearanceToken;
    }

    return headers;
  }

  private async fetchJson<T>(url: string, spartanToken: string, clearanceToken?: string): Promise<T> {
    const response = await this.callFetch(url, {
      method: "GET",
      headers: this.createHeaders(spartanToken, clearanceToken),
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status.toString()} for ${url}`);
    }

    return response.json<T>();
  }

  private async fetchBinary(url: string, spartanToken: string, clearanceToken: string): Promise<Uint8Array> {
    const response = await this.callFetch(url, {
      method: "GET",
      headers: this.createHeaders(spartanToken, clearanceToken, "*/*"),
    });

    if (!response.ok) {
      throw new Error(`Chunk download failed with ${response.status.toString()} for ${url}`);
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  async warmAuthCache(): Promise<void> {
    await this.resolveAuthContext();
  }

  private async resolveAuthContext(): Promise<{ spartanToken: string; clearanceToken: string }> {
    const spartanToken = await this.spartanTokenProvider.getSpartanToken();

    const cachedClearance = await this.env.APP_DATA.get(HaloFilmService.CLEARANCE_CACHE_KEY);
    if (cachedClearance != null) {
      return { spartanToken, clearanceToken: cachedClearance };
    }

    const currentUser = await this.fetchJson<{ xuid: string }>(
      "https://comms.svc.halowaypoint.com:443/users/me",
      spartanToken,
    );

    const playerScopedClearanceUrl = [
      "https://settings.svc.halowaypoint.com:443/oban/flight-configurations/titles/hi/audiences/retail/players",
      wrapXuid(currentUser.xuid),
      "active",
    ].join("/");

    let clearanceToken: string;
    try {
      const playerScopedClearance = await this.fetchJson<{ FlightConfigurationId: string }>(
        playerScopedClearanceUrl,
        spartanToken,
      );
      clearanceToken = playerScopedClearance.FlightConfigurationId;
    } catch {
      const fallbackClearance = await this.fetchJson<{ FlightConfigurationId: string }>(
        "https://settings.svc.halowaypoint.com:443/oban/flight-configurations/titles/hi/audiences/RETAIL/active",
        spartanToken,
      );
      clearanceToken = fallbackClearance.FlightConfigurationId;
    }

    await this.env.APP_DATA.put(HaloFilmService.CLEARANCE_CACHE_KEY, clearanceToken, {
      expirationTtl: HaloFilmService.CLEARANCE_CACHE_TTL_SECONDS,
    });

    return { spartanToken, clearanceToken };
  }

  private getBit(data: Uint8Array, bitOffset: number): number {
    const byteIndex = Math.floor(bitOffset / 8);
    const bitIndex = 7 - (bitOffset % 8);
    const byte = data[byteIndex];
    return byte == null ? 0 : (byte >> bitIndex) & 1;
  }

  private extractBitsToBytes(data: Uint8Array, startBit: number, bitLength: number): Uint8Array {
    const output = new Uint8Array(Math.ceil(bitLength / 8));
    for (let index = 0; index < bitLength; index += 1) {
      const bitValue = this.getBit(data, startBit + index);
      if (bitValue === 1) {
        const byteIndex = Math.floor(index / 8);
        const bitIndex = 7 - (index % 8);
        const currentByte = output[byteIndex];
        output[byteIndex] = (currentByte ?? 0) | (1 << bitIndex);
      }
    }

    return output;
  }

  private readByteAtBitOffset(data: Uint8Array, startBit: number): number {
    return this.extractBitsToBytes(data, startBit, 8)[0] ?? 0;
  }

  private readLittleEndianUnsigned(data: Uint8Array, startBit: number, byteLength: number): bigint {
    const bytes = this.extractBitsToBytes(data, startBit, byteLength * 8);
    let value = 0n;
    for (let index = 0; index < bytes.length; index += 1) {
      value |= BigInt(bytes[index] ?? 0) << BigInt(index * 8);
    }

    return value;
  }

  private findPatternBitOffset(
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
        const expectedByte = pattern[byteIndex];
        if (expectedByte == null) {
          continue;
        }
        const actualByte = this.readByteAtBitOffset(data, candidateBit + byteIndex * 8);
        if (expectedByte !== actualByte) {
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

  private inferEventType(typeHint: number, isMedal: boolean): "kill" | "death" | "medal" | "mode" {
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

    throw new Error(`Unrecognized event type hint: ${typeHint.toString()}`);
  }

  private decodeUtf16Le(bytes: Uint8Array): string {
    const decoded = new TextDecoder("utf-16le").decode(bytes);
    let end = decoded.length;
    while (end > 0 && decoded.charCodeAt(end - 1) === 0) {
      end -= 1;
    }

    return decoded.slice(0, end).trim();
  }

  private parseTimestampMs(bytes: Uint8Array): number {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return view.getUint32(0, false);
  }

  private parseHighlightEvent(
    data: Uint8Array,
    xuidStartBit: number,
    filmMajorVersion: number,
  ): ParsedHighlightEvent | null {
    const eventWindowEndBit = Math.min(data.length * 8, xuidStartBit + EVENT_WINDOW_BITS);
    const eventTerminatorBit = this.findPatternBitOffset(data, xuidStartBit, eventWindowEndBit, EVENT_TERMINATOR_BYTES);
    if (eventTerminatorBit == null) {
      return null;
    }

    const envelopeStartBit = eventTerminatorBit - EVENT_ENVELOPE_BYTES * 8;
    if (envelopeStartBit < xuidStartBit) {
      return null;
    }

    const envelope = this.extractBitsToBytes(data, envelopeStartBit, EVENT_ENVELOPE_BYTES * 8);
    const usesExtendedLayout = filmMajorVersion <= 38 || filmMajorVersion >= 41;
    const gamertagStart = usesExtendedLayout ? 0 : 12;
    const gamertagEnd = gamertagStart + 32;
    const gamertag = this.decodeUtf16Le(envelope.subarray(gamertagStart, gamertagEnd));
    // eslint-disable-next-line @typescript-eslint/prefer-destructuring
    const typeHint = envelope[47];
    // eslint-disable-next-line @typescript-eslint/prefer-destructuring
    const isMedalByte = envelope[55];
    const medalValueBytes = envelope.subarray(56, 60);
    const medalValue =
      medalValueBytes.length === 4
        ? new DataView(medalValueBytes.buffer, medalValueBytes.byteOffset, 4).getUint32(0, true)
        : 0;
    const timestampBytes = envelope.subarray(48, 52);

    if (typeHint == null || isMedalByte == null || timestampBytes.length !== 4 || gamertag === "") {
      return null;
    }

    const xuid = this.readLittleEndianUnsigned(data, xuidStartBit, 8);
    const isMedal = isMedalByte === 1;

    return {
      xuid: xuid.toString(),
      gamertag,
      typeHint,
      isMedal,
      eventType: this.inferEventType(typeHint, isMedal),
      timeMs: this.parseTimestampMs(timestampBytes),
      medalValue,
      teamId: null,
    };
  }

  private parseHighlightEvents(chunkBytes: Uint8Array, filmMajorVersion: number): ParsedHighlightEvent[] {
    const decompressed = new Uint8Array(inflateSync(chunkBytes));
    const events: ParsedHighlightEvent[] = [];
    const seen = new Set<string>();
    const totalBits = decompressed.length * 8;

    for (let markerBit = 0; markerBit <= totalBits - 8; markerBit += 1) {
      if (this.readByteAtBitOffset(decompressed, markerBit) !== 0xc0) {
        continue;
      }

      const markerPrefixBit = markerBit - 8;
      if (markerPrefixBit < 0) {
        continue;
      }

      const markerPrefix = this.readByteAtBitOffset(decompressed, markerPrefixBit);
      if (markerPrefix !== 0x2d && markerPrefix !== 0x25) {
        continue;
      }

      const xuidStartBit = markerPrefixBit - 64;
      if (xuidStartBit < 0) {
        continue;
      }

      const xuidValue = this.readLittleEndianUnsigned(decompressed, xuidStartBit, 8);
      if (xuidValue <= MIN_XUID || xuidValue >= MAX_XUID) {
        continue;
      }

      const event = this.parseHighlightEvent(decompressed, xuidStartBit, filmMajorVersion);
      if (event == null) {
        continue;
      }

      const [xuid, gamertag, eventType, timeMs, typeHint, medalValue] = [
        event.xuid,
        event.gamertag,
        event.eventType,
        event.timeMs.toString(),
        event.typeHint.toString(),
        event.medalValue.toString(),
      ];
      const dedupeKey = [xuid, gamertag, eventType, timeMs, typeHint, medalValue].join(":");
      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      events.push(event);
    }

    return events.sort((left, right) => left.timeMs - right.timeMs);
  }

  private toMetadataCacheRequest(matchId: string): Request {
    return new Request(`${HaloFilmService.FILM_CACHE_BASE_URL}/metadata/${matchId}`);
  }

  private toChunkCacheRequest(matchId: string, chunkIndex: number): Request {
    return new Request(`${HaloFilmService.FILM_CACHE_BASE_URL}/chunk/${matchId}/${chunkIndex.toString()}`);
  }

  private async getCachedJson<T>(request: Request): Promise<T | null> {
    const cached = await caches.default.match(request);
    if (cached == null) {
      return null;
    }

    return cached.json<T>();
  }

  private async putCachedJson(request: Request, payload: unknown): Promise<void> {
    const response = new Response(JSON.stringify(payload), {
      headers: {
        "Cache-Control": `public, max-age=${HaloFilmService.FILM_CACHE_TTL_SECONDS.toString()}`,
        "Content-Type": "application/json",
      },
    });
    await caches.default.put(request, response);
  }

  private async getCachedChunk(request: Request): Promise<Uint8Array | null> {
    const cached = await caches.default.match(request);
    if (cached == null) {
      return null;
    }

    return new Uint8Array(await cached.arrayBuffer());
  }

  private async putCachedChunk(request: Request, chunkBytes: Uint8Array): Promise<void> {
    const response = new Response(chunkBytes, {
      headers: {
        "Cache-Control": `public, max-age=${HaloFilmService.FILM_CACHE_TTL_SECONDS.toString()}`,
        "Content-Type": "application/octet-stream",
      },
    });
    await caches.default.put(request, response);
  }
}
