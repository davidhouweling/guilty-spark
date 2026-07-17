import "dotenv/config";
import path from "node:path";

// Polyfill Cloudflare Workers caches API for Node.js
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
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { authenticate } from "@xboxreplay/xboxlive-auth";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aFakeEnvWith } from "../base/fakes/env.fake";
import { aFakeDatabaseServiceWith } from "../services/database/fakes/database.fake";
import { aFakeLogServiceWith } from "../services/log/fakes/log.fake";
import { aFakePlayerMatchesRateLimiterWith } from "../services/halo/fakes/player-matches-rate-limiter.fake";
import { createFileBackedKVNamespace } from "../base/fakes/namespace-to-file";
import { createHaloInfiniteClientProxy } from "../services/halo/halo-infinite-client-proxy";
import { HaloService } from "../services/halo/halo";
import { XboxService } from "../services/xbox/xbox";
import { CustomSpartanTokenProvider } from "../services/halo/custom-spartan-token-provider";
import { HaloFilmService } from "../services/halo/halo-film";
import { AnalyticsService } from "../services/analytics/analytics";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MATCH_ID = "53e2e332-6219-4360-8148-5595b76bdeeb";

const fakeNamespace = await createFileBackedKVNamespace(path.join(__dirname, "app-data.json"));

const env = aFakeEnvWith({
  APP_DATA: fakeNamespace,
  XBOX_USERNAME: process.env.XBOX_USERNAME,
  XBOX_PASSWORD: process.env.XBOX_PASSWORD,
});

const logService = aFakeLogServiceWith();
const databaseService = aFakeDatabaseServiceWith();
const xboxService = new XboxService({ env, authenticate });
const spartanTokenProvider = new CustomSpartanTokenProvider({ env, xboxService });
const infiniteClient = createHaloInfiniteClientProxy({ env });

const haloService = new HaloService({
  env,
  logService,
  databaseService,
  xboxService,
  infiniteClient,
  playerMatchesRateLimiter: aFakePlayerMatchesRateLimiterWith(),
});

const haloFilmService = new HaloFilmService({
  env,
  spartanTokenProvider,
});

const analyticsService = new AnalyticsService({ haloService, haloFilmService, logService });

const matchStats = Preconditions.checkExists((await haloService.getMatchDetails([MATCH_ID]))[0], "matchStats");
await writeFile(path.join(__dirname, "match-stats.json"), JSON.stringify(matchStats, null, 2));
console.log("Written match-stats.json");

const analytics = await analyticsService.getBatchMatchAnalytics([MATCH_ID], ["killMatrix", "scoreProgression"]);
await writeFile(path.join(__dirname, "match-analytics.json"), JSON.stringify(analytics, null, 2));
console.log("Written match-analytics.json");

const filmEvents = await haloFilmService.getHighlightEventsForMatch(MATCH_ID);
const modeEvents = filmEvents.filter((e) => e.eventType === "mode");
await writeFile(path.join(__dirname, "film-mode-events.json"), JSON.stringify(modeEvents, null, 2));
console.log(`Written film-mode-events.json (${modeEvents.length.toString()} mode events)`);

// Fetch raw film metadata to inspect all chunk types
const spartanToken = await spartanTokenProvider.getSpartanToken();
const cachedClearance = await env.APP_DATA.get("film:clearance");
const haloHeaders = {
  Accept: "application/json",
  "Accept-Language": "en-US",
  "User-Agent": "SHIVA-2043073184/6.10021.18539.0 (release; PC)",
  "x-343-authorization-spartan": spartanToken,
  ...(cachedClearance != null ? { "343-clearance": cachedClearance } : {}),
};
const filmMetadataUrl = `https://discovery-infiniteugc.svc.halowaypoint.com:443/hi/films/matches/${MATCH_ID}/spectate`;
const filmMetadataRes = await fetch(filmMetadataUrl, { headers: haloHeaders });
interface FilmMetadataRaw {
  FilmStatusBond: unknown;
  BlobStoragePathPrefix: string;
  CustomData: { Chunks: { ChunkType: number; Index: number; FileRelativePath: string }[] };
}
const filmMetadata = await filmMetadataRes.json<FilmMetadataRaw>();
await writeFile(path.join(__dirname, "film-metadata.json"), JSON.stringify(filmMetadata, null, 2));
console.log("Written film-metadata.json");

// Save raw highlight chunk (ChunkType=3, findLast mirrors production HaloFilmService.tryFindHighlightChunk)
const highlightChunkMeta = [...filmMetadata.CustomData.Chunks].reverse().find((c) => c.ChunkType === 3);
if (highlightChunkMeta != null) {
  const hlPath = highlightChunkMeta.FileRelativePath.replace(/^\//u, "");
  const hlUrl = `${filmMetadata.BlobStoragePathPrefix}${hlPath}`;
  const hlRes = await fetch(hlUrl, { headers: { ...haloHeaders, Accept: "*/*" } });
  const hlBuffer = Buffer.from(await hlRes.arrayBuffer());
  await writeFile(path.join(__dirname, "film-highlight-chunk.bin"), hlBuffer);
  console.log(`Written film-highlight-chunk.bin (${hlBuffer.length.toString()} bytes compressed)`);
}

// Download ChunkType=1 (game init/settings, 11ms duration) and search for score limit
const initChunk = filmMetadata.CustomData.Chunks.find((c) => c.ChunkType === 1);
if (initChunk != null) {
  const chunkPath = initChunk.FileRelativePath.replace(/^\//u, "");
  const chunkUrl = `${filmMetadata.BlobStoragePathPrefix}${chunkPath}`;
  const chunkRes = await fetch(chunkUrl, { headers: { ...haloHeaders, Accept: "*/*" } });
  const chunkBuffer = Buffer.from(await chunkRes.arrayBuffer());

  // Search for ASCII and UTF-16LE strings that contain "score" or small uint32 values that match kill limits
  const { inflateSync } = await import("node:zlib");
  let decompressed: Buffer;
  try {
    decompressed = Buffer.from(inflateSync(chunkBuffer));
  } catch {
    decompressed = chunkBuffer;
  }
  await writeFile(path.join(__dirname, "film-init-chunk.bin"), decompressed);
  console.log(`Written film-init-chunk.bin (${decompressed.length.toString()} bytes decompressed)`);

  function hexDump(buf: Buffer, offset: number, label: string): void {
    const start = Math.max(0, offset - 16);
    const end = Math.min(buf.length, offset + 20);
    const hex = buf.subarray(start, end).toString("hex").match(/.{2}/gu)?.join(" ") ?? "";
    const ascii = buf.subarray(start, end).toString("latin1").replace(/[^\x20-\x7eu]/gu, ".");
    console.log(`  [${label}] offset ${offset.toString()}: ${hex}`);
    console.log(`    ascii: ${ascii}`);
  }

  // Search for the score limit (50) under several encodings
  const target = 50;
  for (let i = 0; i <= decompressed.length - 4; i += 1) {
    if (decompressed.readUInt32LE(i) === target) { hexDump(decompressed, i, "u32LE"); }
    if (decompressed.readUInt32BE(i) === target) { hexDump(decompressed, i, "u32BE"); }
  }
  for (let i = 0; i <= decompressed.length - 2; i += 1) {
    if (decompressed.readUInt16LE(i) === target && decompressed[i + 2] === 0 && decompressed[i + 3] === 0) {
      hexDump(decompressed, i, "u16LE+pad");
    }
  }

  // Try float32 (50.0 = 0x42480000)
  const float32Buf = Buffer.alloc(4);
  float32Buf.writeFloatLE(50.0, 0);
  let f32idx = decompressed.indexOf(float32Buf);
  while (f32idx >= 0) {
    hexDump(decompressed, f32idx, "f32LE=50.0");
    f32idx = decompressed.indexOf(float32Buf, f32idx + 1);
  }

  // Also search for score-related label strings
  const labelPatterns = ["ScoreLimit", "KillLimit", "MaxScore", "ScoreToWin", "TargetScore", "KillsToWin", "ScoreKills", "score_limit", "kill_limit", "TeamScoreToWin"];
  for (const label of labelPatterns) {
    const idx = decompressed.indexOf(label);
    if (idx >= 0) {
      hexDump(decompressed, idx, `str:${label}`);
    }
    const utf16 = Buffer.from(label, "utf16le");
    const idx16 = decompressed.indexOf(utf16);
    if (idx16 >= 0) {
      hexDump(decompressed, idx16, `utf16:${label}`);
    }
  }

  console.log("FilmStatusBond:", JSON.stringify(filmMetadata.FilmStatusBond));

// Fetch UgcGameVariant to look for score limit in game mode definition
const { UgcGameVariant } = matchStats.MatchInfo;
const gameVariantUrl = [
  "https://discovery-infiniteugc.svc.halowaypoint.com:443/hi/ugcGameVariants",
  UgcGameVariant.AssetId,
  "versions",
  UgcGameVariant.VersionId,
].join("/");
const gameVariantRes = await fetch(gameVariantUrl, { headers: haloHeaders });
const gameVariant = await gameVariantRes.json();
await writeFile(path.join(__dirname, "game-variant.json"), JSON.stringify(gameVariant, null, 2));
console.log("Written game-variant.json");
}
