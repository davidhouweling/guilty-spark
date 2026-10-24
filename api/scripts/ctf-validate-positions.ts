/**
 * Validates the film position decoder: decodes player positions for a match, prints the detected
 * axis layout, slot band, life naming and per-player track summary, and when a LevelUp
 * positions.csv (chunk,packet,us,slot,qx,qy,qz) is supplied compares the raw scan against it, keyed on
 * slot, frame time and quanta.
 *
 * Run: DOTENV_CONFIG_PATH=api/.dev.vars npx tsx api/scripts/ctf-validate-positions.ts <matchId> [--levelup=<positions.csv>]
 */
import { readFileSync } from "node:fs";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import { earliestTimestampUs, packetTimestampMs, walkFramePackets } from "../services/halo/statborg/bit-reader";
import { detectAxisLayout } from "../services/halo/positions/axis-layout";
import { scanChunkPositions } from "../services/halo/positions/build-player-positions";
import { bipedSlotBand } from "../services/halo/positions/keyframe-slots";
import { dropIsolated } from "../services/halo/positions/position-filters";
import { createScriptServices, fmtMs } from "./script-services";

const MATCH_ID = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? "5e3900a6-69ee-42f6-9a79-5146e8802a0c";
const LEVELUP_CSV = process.argv.find((arg) => arg.startsWith("--levelup="))?.slice("--levelup=".length);

const { haloService, haloFilmService } = await createScriptServices();
const [matchStats] = await haloService.getMatchDetails([MATCH_ID]);
if (matchStats == null) {
  console.log("ERROR: Failed to fetch match stats");
  process.exit(1);
}

const startedAt = performance.now();
const positions = await haloFilmService.buildPlayerPositions(matchStats);
console.log(
  `Decoded in ${String(Math.round(performance.now() - startedAt))}ms: layout gate=${String(positions.layout.gateBits)} ${positions.layout.axisWidths.join("/")}, ${String(positions.tracks.length)} tracks, ${String(positions.unnamedLives.length)} unnamed lives`,
);
const gamertags = new Map(matchStats.Players.map((player) => [unwrapXuid(player.PlayerId), player.PlayerId]));
for (const track of positions.tracks) {
  const samples = track.lives.reduce((sum, life) => sum + life.samples.length, 0);
  const span = track.lives.map((life) => `${fmtMs(life.startMs)}-${fmtMs(life.endMs)}`).join(" ");
  console.log(
    `  T${String(track.teamId)} ${gamertags.get(track.xuid) ?? track.xuid}: ${String(track.lives.length)} lives, ${String(samples)} samples [${span}]`,
  );
}
for (const life of positions.unnamedLives) {
  console.log(
    `  unnamed slot ${String(life.slot)}: ${fmtMs(life.startMs)}-${fmtMs(life.endMs)} (${String(life.samples.length)} samples)`,
  );
}

if (LEVELUP_CSV != null) {
  const { chunks } = await haloFilmService.getReplicationChunks(MATCH_ID);
  const slots = bipedSlotBand(chunks);
  const layout = detectAxisLayout(chunks, slots);
  const ours = dropIsolated(chunks.flatMap((chunk) => scanChunkPositions(chunk, slots, layout)));
  const key = (slot: number, ms: number, q: readonly number[]): string =>
    `${String(slot)}|${String(ms)}|${q.join(",")}`;
  const ourKeys = new Set(ours.map((position) => key(position.slot, position.timestampMs, position.q)));
  const msByUs = new Map<bigint, number>();
  for (const chunk of chunks) {
    const frames = walkFramePackets(chunk.data);
    const originUs = earliestTimestampUs(frames);
    for (const frame of frames) {
      if (originUs != null) {
        msByUs.set(frame.timestampUs, packetTimestampMs(chunk.startMs, originUs, frame));
      }
    }
  }
  const theirs = readFileSync(LEVELUP_CSV, "utf8").trim().split("\n").slice(1);
  const theirKeys = new Set<string>();
  for (const line of theirs) {
    const [, , us, slot, qx, qy, qz] = line.split(",");
    const ms = us == null ? undefined : msByUs.get(BigInt(us));
    if (ms != null && slot != null && qx != null && qy != null && qz != null) {
      theirKeys.add(key(Number(slot), ms, [Number(qx), Number(qy), Number(qz)]));
    }
  }
  const missing = [...theirKeys].filter((item) => !ourKeys.has(item));
  const extra = [...ourKeys].filter((item) => !theirKeys.has(item));
  console.log(
    `\nParity vs LevelUp: slots ${String(Math.min(...slots))}-${String(Math.max(...slots))}, ours ${String(ourKeys.size)} theirs ${String(theirKeys.size)}, missing ${String(missing.length)}, extra ${String(extra.length)}`,
  );
  for (const item of [...missing.slice(0, 5), ...extra.slice(0, 5)]) {
    console.log(`  ${missing.includes(item) ? "missing" : "extra  "} ${item}`);
  }
}
