/**
 * Dumps decompressed replication chunks to <outDir>/chunk_NN.bin plus manifest.json (LevelUp filmdec layout).
 * Run: DOTENV_CONFIG_PATH=api/.dev.vars npx tsx api/scripts/ctf-dump-chunks.ts <matchId> <outDir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createScriptServices } from "./script-services";

const matchId = process.argv[2] ?? "5e3900a6-69ee-42f6-9a79-5146e8802a0c";
const outDir = process.argv[3] ?? `./film-${matchId.slice(0, 8)}`;
mkdirSync(outDir, { recursive: true });
const { haloFilmService } = await createScriptServices();
const { chunks, skippedChunks } = await haloFilmService.getReplicationChunks(matchId);
if (skippedChunks.length > 0) {
  console.log(`WARNING: skipped malformed chunks ${skippedChunks.map((chunk) => String(chunk.index)).join(", ")}`);
}
for (const c of chunks) {
  writeFileSync(path.join(outDir, `chunk_${String(c.index).padStart(2, "0")}.bin`), c.data);
}
writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify(
    chunks.map((c) => ({ index: c.index, startMs: c.startMs, durationMs: c.durationMs, bytes: c.data.length })),
    null,
    1,
  ),
);
console.log(`wrote ${String(chunks.length)} chunks to ${outDir}`);
