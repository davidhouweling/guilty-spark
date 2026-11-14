/**
 * Runs local KOTH analytics through the current SDK and compares the full contract
 * with production. Requires local Xbox credentials through the script bootstrap.
 *
 * Run: DOTENV_CONFIG_PATH=<environment-file> npx tsx api/scripts/koth-compare-production.ts <matchId>
 */
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { batchMatchAnalyticsContract } from "@guilty-spark/shared/contracts/stats/batch-match-analytics";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { AnalyticsService } from "../services/analytics/analytics";

export function assertKothAnalyticsMatch(
  local: MatchAnalytics | null | undefined,
  production: MatchAnalytics | null | undefined,
): void {
  if (local?.scoreProgression?.timeline.type !== "koth") {
    throw new Error("Local analytics did not produce a KOTH timeline");
  }
  if (production?.scoreProgression?.timeline.type !== "koth") {
    throw new Error("Production analytics did not produce a KOTH timeline");
  }
  assert.deepStrictEqual(local, production, "Local KOTH analytics differ from production");
}

async function compareWithProduction(): Promise<void> {
  const matchId = process.argv[2]?.trim();
  if (matchId == null || matchId === "") {
    throw new Error("Usage: npx tsx api/scripts/koth-compare-production.ts <matchId>");
  }
  const url = new URL("/api/stats/match-analytics", "https://api.guilty-spark.app");
  url.searchParams.set("matchIds", matchId);
  url.searchParams.set("modules", "killMatrix,scoreProgression");
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) {
    throw new Error(`Production analytics request failed with HTTP ${response.status.toString()}`);
  }
  const production = await batchMatchAnalyticsContract.fromResponse(response);

  const { createScriptServices } = await import("./script-services");
  const { haloService, haloFilmService, databaseService, logService } = await createScriptServices();
  const analyticsService = new AnalyticsService({ haloService, haloFilmService, databaseService, logService });
  const results = await analyticsService.getBatchMatchAnalytics([matchId], ["killMatrix", "scoreProgression"]);
  const local = batchMatchAnalyticsContract.parse({ results });

  assertKothAnalyticsMatch(local.results[matchId], production.results[matchId]);
  console.log(`PASS: ${matchId} local KOTH analytics exactly match production.`);
}

const [, scriptPath] = process.argv;
if (scriptPath != null && resolve(scriptPath) === fileURLToPath(import.meta.url)) {
  await compareWithProduction();
}
