/**
 * Full weapon attribution analysis against cached match 53e2e332.
 *
 * Run with: npx tsx api/scripts/type2-weapon-analysis.ts
 *
 * Downloads all 47 type-2 chunks (uses cache in type2-chunks/ for already-fetched ones),
 * runs WeaponAttributor against the paired kill/death events from the cached highlight
 * chunk, and tables the output per killer→victim pair.
 */
import path from "node:path";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { scanFireEvents, WeaponAttributor } from "../services/halo/halo-film-type2";
import { KILL_DEATH_PAIRING_MAX_DELTA_MS } from "../services/halo/constants";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "type2-chunks");

interface FilmMeta {
  BlobStoragePathPrefix: string;
  CustomData: {
    Chunks: {
      Index: number;
      ChunkType: number;
      FileRelativePath: string;
      DurationMilliseconds: number;
    }[];
  };
}

interface CachedEvent {
  xuid: string;
  gamertag: string;
  eventType: string;
  timeMs: number;
}

interface KillPair {
  killerXuid: string;
  killerGamertag: string;
  victimXuid: string;
  victimGamertag: string;
  timeMs: number;
}

interface MatchStatsPlayer {
  PlayerId: string;
  LastTeamId: number;
  Rank: number;
}

if (!existsSync(CACHE_DIR)) {
  await mkdir(CACHE_DIR, { recursive: true });
}

// --- Load inputs ---

const filmMeta = JSON.parse(await readFile(path.join(__dirname, "film-metadata.json"), "utf-8")) as FilmMeta;

const appData = JSON.parse(await readFile(path.join(__dirname, "app-data.json"), "utf-8")) as Record<string, string>;
const filmEventsRaw = appData["halo:film:match:53e2e332-6219-4360-8148-5595b76bdeeb"];
if (filmEventsRaw == null) {throw new Error("film events not found in app-data.json");}
const filmEvents = JSON.parse(filmEventsRaw) as CachedEvent[];

const matchStats = JSON.parse(await readFile(path.join(__dirname, "match-stats.json"), "utf-8")) as {
  Players: MatchStatsPlayer[];
};

// --- Build xuid → playerIndex mapping (mirrors production buildXuidToPlayerIndex) ---

function unwrapXuid(raw: string): string {
  return raw.replace(/^xuid\(|\)$/gu, "");
}

const sortedPlayers = [...matchStats.Players].sort(
  (a, b) => a.LastTeamId - b.LastTeamId || a.Rank - b.Rank,
);
const xuidToPlayerIndex = new Map<string, number>();
for (const [index, player] of sortedPlayers.entries()) {
  xuidToPlayerIndex.set(unwrapXuid(player.PlayerId), index);
}

// --- Pair kill events with death events (mirrors production buildKillMatrixEntriesByPairing) ---

const kills = filmEvents.filter((e) => e.eventType === "kill");
const deaths = filmEvents.filter((e) => e.eventType === "death");

const killersByTime = new Map<number, CachedEvent[]>();
for (const k of kills) {
  const bucket = killersByTime.get(k.timeMs) ?? [];
  bucket.push(k);
  killersByTime.set(k.timeMs, bucket);
}

const usedDeathIndices = new Set<number>();
const killPairs: KillPair[] = [];

for (const kill of kills) {
  let bestDeathIndex = -1;
  let bestTimeDelta = Infinity;

  for (let di = 0; di < deaths.length; di++) {
    if (usedDeathIndices.has(di)) {continue;}
    const death = deaths[di];
    if (death == null) {continue;}
    const delta = Math.abs(kill.timeMs - death.timeMs);
    if (delta <= KILL_DEATH_PAIRING_MAX_DELTA_MS && delta < bestTimeDelta) {
      bestTimeDelta = delta;
      bestDeathIndex = di;
    }
  }

  if (bestDeathIndex >= 0) {
    const death = deaths[bestDeathIndex];
    if (death != null) {
      usedDeathIndices.add(bestDeathIndex);
      killPairs.push({
        killerXuid: kill.xuid,
        killerGamertag: kill.gamertag,
        victimXuid: death.xuid,
        victimGamertag: death.gamertag,
        timeMs: kill.timeMs,
      });
    }
  }
}

// --- Download and scan all type-2 chunks ---

const type2Chunks = [...filmMeta.CustomData.Chunks]
  .filter((c) => c.ChunkType === 2)
  .sort((a, b) => a.Index - b.Index);

let cumulativeMs = 0;
const chunkOffsets = new Map<number, number>();
for (const chunk of filmMeta.CustomData.Chunks.sort((a, b) => a.Index - b.Index)) {
  if (chunk.ChunkType === 2) {
    chunkOffsets.set(chunk.Index, cumulativeMs);
  }
  cumulativeMs += chunk.DurationMilliseconds;
}

console.log(`Scanning ${type2Chunks.length.toString()} type-2 chunks...\n`);

let allFireEvents: ReturnType<typeof scanFireEvents> = [];
let downloaded = 0;
let cached = 0;

for (const chunk of type2Chunks) {
  const cacheFile = path.join(CACHE_DIR, `chunk${chunk.Index.toString()}.bin`);
  let compressedBytes: Uint8Array;

  if (existsSync(cacheFile)) {
    compressedBytes = new Uint8Array(await readFile(cacheFile));
    cached++;
  } else {
    const chunkPath = chunk.FileRelativePath.replace(/^\//u, "");
    const url = `${filmMeta.BlobStoragePathPrefix}${chunkPath}`;
    process.stdout.write(`  Downloading chunk ${chunk.Index.toString()}... `);
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`FAILED (HTTP ${res.status.toString()})`);
      continue;
    }
    compressedBytes = new Uint8Array(await res.arrayBuffer());
    await writeFile(cacheFile, compressedBytes);
    console.log(`${compressedBytes.length.toString()} bytes`);
    downloaded++;
  }

  const startMs = chunkOffsets.get(chunk.Index) ?? 0;
  const decompressed = new Uint8Array(inflateSync(compressedBytes));
  const events = scanFireEvents(decompressed, startMs, chunk.DurationMilliseconds);
  allFireEvents = allFireEvents.concat(events);
}

console.log(`\nChunks: ${cached.toString()} cached, ${downloaded.toString()} downloaded`);
console.log(`Total fire events: ${allFireEvents.length.toString()}`);
console.log(`Total kill pairs: ${killPairs.length.toString()}`);

// --- Attribute weapons to kill pairs ---

const attributor = new WeaponAttributor(allFireEvents);

interface AttributedKill {
  killer: string;
  victim: string;
  timeMs: number;
  weapon: string | null;
  weaponId: string | null;
}

const attributed: AttributedKill[] = [];
let weaponFound = 0;
let weaponMissed = 0;

for (const pair of killPairs) {
  const playerIndex = xuidToPlayerIndex.get(pair.killerXuid) ?? null;
  const result = attributor.claim(playerIndex, pair.timeMs);
  attributed.push({
    killer: pair.killerGamertag,
    victim: pair.victimGamertag,
    timeMs: pair.timeMs,
    weapon: result?.name ?? null,
    weaponId: result?.weaponId ?? null,
  });
  if (result != null) {
    weaponFound++;
  } else {
    weaponMissed++;
  }
}

// --- Table: per-pair weapon breakdown ---

interface PairSummary {
  killer: string;
  victim: string;
  count: number;
  weapons: Map<string, number>;
  unattributed: number;
}

const pairMap = new Map<string, PairSummary>();
for (const a of attributed) {
  const key = `${a.killer}::${a.victim}`;
  let summary = pairMap.get(key);
  if (summary == null) {
    summary = { killer: a.killer, victim: a.victim, count: 0, weapons: new Map(), unattributed: 0 };
    pairMap.set(key, summary);
  }
  summary.count++;
  if (a.weapon != null) {
    summary.weapons.set(a.weapon, (summary.weapons.get(a.weapon) ?? 0) + 1);
  } else {
    summary.unattributed++;
  }
}

const pairs = [...pairMap.values()].sort((a, b) => b.count - a.count);

// --- Table: weapon totals across all kills ---

const weaponTotals = new Map<string, number>();
for (const a of attributed) {
  if (a.weapon != null) {
    weaponTotals.set(a.weapon, (weaponTotals.get(a.weapon) ?? 0) + 1);
  }
}
const sortedWeapons = [...weaponTotals.entries()].sort((a, b) => b[1] - a[1]);

// --- Output ---

console.log(`\n${"=".repeat(72)}`);
console.log("WEAPON TOTALS (all kills)");
console.log("=".repeat(72));
console.log(`${"Weapon".padEnd(30)} ${"Kills".padStart(6)} ${"% of total".padStart(12)}`);
console.log("-".repeat(50));
for (const [name, count] of sortedWeapons) {
  const pct = ((count / weaponFound) * 100).toFixed(1);
  console.log(`${name.padEnd(30)} ${count.toString().padStart(6)} ${(pct + "%").padStart(12)}`);
}
console.log("-".repeat(50));
console.log(
  `${"TOTAL attributed".padEnd(30)} ${weaponFound.toString().padStart(6)} ${(((weaponFound / killPairs.length) * 100).toFixed(1) + "%").padStart(12)}`,
);
console.log(
  `${"Unattributed".padEnd(30)} ${weaponMissed.toString().padStart(6)} ${(((weaponMissed / killPairs.length) * 100).toFixed(1) + "%").padStart(12)}`,
);

console.log(`\n${"=".repeat(72)}`);
console.log("KILL PAIRS WITH WEAPON BREAKDOWN (sorted by kill count)");
console.log("=".repeat(72));
console.log(`${"Killer".padEnd(22)} ${"Victim".padEnd(22)} ${"K".padStart(3)} Weapons (kill count)`);
console.log("-".repeat(72));
for (const p of pairs) {
  const weaponStr =
    [...p.weapons.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([w, c]) => `${w}×${c.toString()}`)
      .join(", ") + (p.unattributed > 0 ? `  [unattributed×${p.unattributed.toString()}]` : "");
  console.log(`${p.killer.padEnd(22)} ${p.victim.padEnd(22)} ${p.count.toString().padStart(3)}  ${weaponStr}`);
}

console.log(`\nAttribution rate: ${weaponFound.toString()}/${killPairs.length.toString()} kills (${(((weaponFound / killPairs.length) * 100).toFixed(1))}%)`);
