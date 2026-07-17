/**
 * Investigation script: find the headshot indicator in film event envelopes.
 *
 * Run with: DOTENV_CONFIG_PATH=api/.dev.vars npx tsx api/scripts/headshot-investigation.ts
 *
 * Dumps the unread bytes (32-46 and 52-54) of the 60-byte event envelope for every
 * kill event by EXEPTION 1, with known headshot ground truth from theatre marked.
 */
import "dotenv/config";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

if (typeof caches === "undefined") {
  /* eslint-disable @typescript-eslint/promise-function-async */
  (globalThis as unknown as Record<string, unknown>)["caches"] = {
    default: {
      match: (): Promise<undefined> => Promise.resolve(undefined),
      put: (): Promise<void> => Promise.resolve(),
      delete: (): Promise<boolean> => Promise.resolve(false),
    },
  };
  /* eslint-enable @typescript-eslint/promise-function-async */
}

// Auth imports only used when local cache is absent
import { authenticate } from "@xboxreplay/xboxlive-auth";
import { aFakeEnvWith } from "../base/fakes/env.fake";
import { createFileBackedKVNamespace } from "../base/fakes/namespace-to-file";
import { XboxService } from "../services/xbox/xbox";
import { CustomSpartanTokenProvider } from "../services/halo/custom-spartan-token-provider";
import { HALO_PC_USER_AGENT } from "../services/halo/constants";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXEPTION_XUID = 2533274795624229n;

// Ground truth from theatre (headshot = true means theatre showed headshot icon)
// timeMs values from the film event cache — matched by proximity to theatre times
const GROUND_TRUTH: Record<number, boolean | "perfect"> = {
  40344: false, // 0:42  NOT headshot
  43781: "perfect", // 0:44  perfect (not headshot in the simple sense)
  85105: true, // 1:25  HEADSHOT
  91211: true, // 1:30  HEADSHOT
  99386: true, // 1:40  HEADSHOT
  110981: true, // 1:51  HEADSHOT
  115819: true, // 1:55  HEADSHOT
  146834: false, // 2:27  NOT headshot
  150955: true, // 2:31  HEADSHOT
  155760: true, // 2:34  HEADSHOT
};

// ── Bit-level helpers (mirrors halo-film.ts private methods) ─────────────────

function getBit(data: Uint8Array, bitOffset: number): number {
  const byteIndex = Math.floor(bitOffset / 8);
  const bitIndex = 7 - (bitOffset % 8);
  const byte = data[byteIndex];
  return byte == null ? 0 : (byte >> bitIndex) & 1;
}

function extractBitsToBytes(data: Uint8Array, startBit: number, bitLength: number): Uint8Array {
  const output = new Uint8Array(Math.ceil(bitLength / 8));
  for (let i = 0; i < bitLength; i += 1) {
    if (getBit(data, startBit + i) === 1) {
      const byteIndex = Math.floor(i / 8);
      const bitIndex = 7 - (i % 8);
      output[byteIndex] = (output[byteIndex] ?? 0) | (1 << bitIndex);
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
  for (let i = 0; i < bytes.length; i += 1) {
    value |= BigInt(bytes[i] ?? 0) << BigInt(i * 8);
  }
  return value;
}

const EVENT_TERMINATOR = Uint8Array.of(0x00, 0x00, 0x2e, 0xe0);
const EVENT_WINDOW_BITS = 20_000;
const EVENT_ENVELOPE_BYTES = 60;
const MIN_XUID = 2_000_000_000_000_000n;
const MAX_XUID = 3_000_000_000_000_000n;

function findTerminatorBit(data: Uint8Array, startBit: number, endBit: number): number | null {
  const patternBits = EVENT_TERMINATOR.length * 8;
  for (let candidate = startBit; candidate <= endBit - patternBits; candidate += 1) {
    let match = true;
    for (let b = 0; b < EVENT_TERMINATOR.length; b += 1) {
      if (readByteAtBitOffset(data, candidate + b * 8) !== (EVENT_TERMINATOR[b] ?? 0)) {
        match = false;
        break;
      }
    }
    if (match) {
      return candidate;
    }
  }
  return null;
}

interface RawEvent {
  xuid: bigint;
  timeMs: number;
  typeHint: number;
  isMedal: boolean;
  /** All 60 envelope bytes */
  envelope: Uint8Array;
}

function scanEvents(decompressed: Uint8Array, filmMajorVersion: number): RawEvent[] {
  const totalBits = decompressed.length * 8;
  const results: RawEvent[] = [];
  const seen = new Set<string>();

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

    const windowEnd = Math.min(totalBits, xuidStartBit + EVENT_WINDOW_BITS);
    const terminatorBit = findTerminatorBit(decompressed, xuidStartBit, windowEnd);
    if (terminatorBit == null) {
      continue;
    }

    const envelopeStartBit = terminatorBit - EVENT_ENVELOPE_BYTES * 8;
    if (envelopeStartBit < xuidStartBit) {
      continue;
    }

    const envelope = extractBitsToBytes(decompressed, envelopeStartBit, EVENT_ENVELOPE_BYTES * 8);

    const usesExtendedLayout = filmMajorVersion <= 38 || filmMajorVersion >= 41;
    const typeHint = envelope[47] ?? 0;
    const isMedal = (envelope[55] ?? 0) === 1;
    const timestampBytes = envelope.subarray(48, 52);
    const timeMs = new DataView(timestampBytes.buffer, timestampBytes.byteOffset, 4).getUint32(0, false);
    const gamertagStart = usesExtendedLayout ? 0 : 12;
    const gamertag = new TextDecoder("utf-16le")
      .decode(envelope.subarray(gamertagStart, gamertagStart + 32))
      .replace(/\0+$/u, "")
      .trim();

    const dedupeKey = [xuid.toString(), gamertag, typeHint.toString(), timeMs.toString(), isMedal.toString()].join(":");
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    results.push({ xuid, timeMs, typeHint, isMedal, envelope });
  }

  return results;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

// ── Main ─────────────────────────────────────────────────────────────────────

// Load highlight chunk — use local cache if analytics-client.ts has already written it,
// otherwise fetch from Halo servers and save for future runs
const localChunkPath = path.join(__dirname, "film-highlight-chunk.bin");
const localMetaPath = path.join(__dirname, "film-metadata.json");

interface FilmMeta {
  BlobStoragePathPrefix: string;
  CustomData: {
    FilmMajorVersion: number;
    Chunks: { ChunkType: number; Index: number; FileRelativePath: string }[];
  };
}

let compressedBytes: Uint8Array;

// Resolve film metadata (prefer cached file)
let meta: FilmMeta;
if (existsSync(localMetaPath)) {
  meta = JSON.parse(await readFile(localMetaPath, "utf8")) as FilmMeta;
  console.log("Using cached film-metadata.json");
} else {
  throw new Error("film-metadata.json not found — run analytics-client.ts first, or add metadata fetch here");
}
const filmMajorVersion = meta.CustomData.FilmMajorVersion;
console.log(`FilmMajorVersion: ${filmMajorVersion.toString()}`);

// Resolve highlight chunk bytes (prefer cached file)
if (existsSync(localChunkPath)) {
  console.log("Using cached film-highlight-chunk.bin (no credentials needed)");
  compressedBytes = new Uint8Array(await readFile(localChunkPath));
} else {
  // Need credentials to download the chunk
  const fakeNamespace = await createFileBackedKVNamespace(path.join(__dirname, "app-data.json"));
  const env = aFakeEnvWith({
    APP_DATA: fakeNamespace,
    XBOX_USERNAME: process.env.XBOX_USERNAME,
    XBOX_PASSWORD: process.env.XBOX_PASSWORD,
  });
  const xboxService = new XboxService({ env, authenticate });
  const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });

  const spartanToken = await spartanTokenProvider.getSpartanToken();
  const cachedClearance = await env.APP_DATA.get("film:clearance");
  const haloHeaders = {
    Accept: "application/json",
    "Accept-Language": "en-US",
    "User-Agent": HALO_PC_USER_AGENT,
    "x-343-authorization-spartan": spartanToken,
    ...(cachedClearance != null ? { "343-clearance": cachedClearance } : {}),
  };

  const highlightChunk = [...meta.CustomData.Chunks].reverse().find((c) => c.ChunkType === 3);
  if (highlightChunk == null) {
    throw new Error("No highlight chunk (ChunkType=3) found in metadata");
  }
  const chunkUrl = `${meta.BlobStoragePathPrefix}${highlightChunk.FileRelativePath.replace(/^\//u, "")}`;
  console.log(`Downloading highlight chunk from: ${chunkUrl}`);
  const chunkRes = await fetch(chunkUrl, { headers: { ...haloHeaders, Accept: "*/*" } });
  compressedBytes = new Uint8Array(await chunkRes.arrayBuffer());
  await writeFile(localChunkPath, compressedBytes);
  console.log(`Saved to film-highlight-chunk.bin for future runs`);
}

const decompressed = new Uint8Array(inflateSync(compressedBytes));
console.log(`Decompressed chunk size: ${decompressed.length.toString()} bytes`);

// Scan all events
console.log("Scanning events (this takes ~30s for a large chunk)...");
const allEvents = scanEvents(decompressed, filmMajorVersion);
const exeptionKills = allEvents.filter((e) => e.xuid === EXEPTION_XUID && e.typeHint === 50 && !e.isMedal);

console.log(`\nFound ${exeptionKills.length.toString()} kill events for EXEPTION 1\n`);

// Print header
const colW = 8;
console.log(
  "timeMs".padStart(colW),
  "headshot?".padEnd(10),
  "bytes 32-46 (unread after gamertag)".padEnd(48),
  "bytes 52-54 (after timestamp)",
);
console.log("-".repeat(120));

for (const e of exeptionKills.sort((a, b) => a.timeMs - b.timeMs)) {
  const gt = GROUND_TRUTH[e.timeMs];
  const label = gt === "perfect" ? "perfect " : gt === true ? "HEADSHOT" : gt === false ? "normal  " : "unknown ";
  const bytes32to46 = hex(e.envelope.subarray(32, 47));
  const bytes52to54 = hex(e.envelope.subarray(52, 55));
  const marker = gt === true ? " <<<" : "";
  console.log(e.timeMs.toString().padStart(colW), label.padEnd(10), bytes32to46.padEnd(48), bytes52to54 + marker);
}

console.log("\nFull byte 52 values for known events:");
for (const e of exeptionKills.sort((a, b) => a.timeMs - b.timeMs)) {
  const gt = GROUND_TRUTH[e.timeMs];
  if (gt !== undefined) {
    const b52 = (e.envelope[52] ?? 0).toString(16).padStart(2, "0");
    const b53 = (e.envelope[53] ?? 0).toString(16).padStart(2, "0");
    const b54 = (e.envelope[54] ?? 0).toString(16).padStart(2, "0");
    const label = gt === "perfect" ? "perfect" : gt ? "HEADSHOT" : "normal";
    console.log(`  ${e.timeMs.toString().padStart(7)} ${label.padEnd(10)} b52=${b52} b53=${b53} b54=${b54}`);
  }
}
