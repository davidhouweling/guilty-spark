/**
 * Validates Strongholds score reconstruction for a given match.
 *
 * Run: DOTENV_CONFIG_PATH=api/.dev.vars npx tsx api/scripts/strongholds-validate-match.ts <matchId>
 */
import "dotenv/config";
import path from "node:path";

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
import { authenticate } from "@xboxreplay/xboxlive-auth";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
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
import { buildStrongholdsProgression } from "../services/halo/modes/strongholds/strongholds-progression";
import type { StrongholdsScorePoint } from "../services/halo/modes/strongholds/strongholds-progression";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATCH_ID = process.argv[2] ?? "2104a978-6965-4ea2-831a-f5eb661ae1ea";

const fakeNamespace = await createFileBackedKVNamespace(path.join(__dirname, "app-data.json"));
const env = aFakeEnvWith({
  APP_DATA: fakeNamespace,
  XBOX_USERNAME: process.env.XBOX_USERNAME,
  XBOX_PASSWORD: process.env.XBOX_PASSWORD,
});

const haloService = new HaloService({
  env,
  logService: aFakeLogServiceWith(),
  databaseService: aFakeDatabaseServiceWith(),
  xboxService: new XboxService({ env, authenticate }),
  infiniteClient: createHaloInfiniteClientProxy({ env }),
  playerMatchesRateLimiter: aFakePlayerMatchesRateLimiterWith(),
});
const haloFilmService = new HaloFilmService({
  env,
  spartanTokenProvider: new CustomSpartanTokenProvider({ env, xboxService: new XboxService({ env, authenticate }) }),
});

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60).toString()}:${(s % 60).toString().padStart(2, "0")}`;
}

console.log(`\nValidating Strongholds match: ${MATCH_ID}`);

const [matchStats] = await haloService.getMatchDetails([MATCH_ID]);
if (matchStats == null) {
  console.log("ERROR: Failed to fetch match stats");
  process.exit(1);
}

const durationMs = Math.round(getDurationInSeconds(matchStats.MatchInfo.Duration) * 1000);
console.log(`durationMs: ${String(durationMs)} (${fmtMs(durationMs)})`);
for (const team of matchStats.Teams) {
  const zones = "ZonesStats" in team.Stats ? team.Stats.ZonesStats : null;
  console.log(
    `  Team ${String(team.TeamId)}: Score=${String(team.Stats.CoreStats.Score)}` +
      (zones
        ? ` ticks=${String(zones.StrongholdScoringTicks)} captures=${String(zones.StrongholdCaptures)} secures=${String(zones.StrongholdSecures)}`
        : ""),
  );
}

const xuidToTeamId = new Map<string, number>();
for (const player of matchStats.Players) {
  xuidToTeamId.set(unwrapXuid(player.PlayerId), player.LastTeamId);
}
const rawEvents = await haloFilmService.getHighlightEventsForMatch(MATCH_ID);
const events = rawEvents.map((event) => ({ ...event, teamId: xuidToTeamId.get(event.xuid) ?? null }));

const progression = buildStrongholdsProgression(events, matchStats, durationMs);

const teamIds = matchStats.Teams.map((t) => t.TeamId).sort((a, b) => a - b);

function scoreAt(points: readonly StrongholdsScorePoint[], teamId: number, timestampMs: number): number {
  const key = String(teamId);
  let previous = { timestampMs: 0, value: 0 };
  for (const point of points) {
    const value = point.runningScores[key] ?? 0;
    if (point.timestampMs >= timestampMs) {
      const span = point.timestampMs - previous.timestampMs;
      return span === 0
        ? value
        : previous.value + ((value - previous.value) * (timestampMs - previous.timestampMs)) / span;
    }
    previous = { timestampMs: point.timestampMs, value };
  }
  return previous.value;
}

console.log(`\nMinute-by-minute reconstruction (${String(progression.events.length)} curve points):`);
for (let minute = 1; minute * 60000 <= durationMs; minute++) {
  const scores = teamIds.map((id) => String(Math.round(scoreAt(progression.events, id, minute * 60000))));
  console.log(`  @${String(minute)}:00  ${scores.join(":")}`);
}
const finals = teamIds.map((id) => String(Math.round(scoreAt(progression.events, id, durationMs))));
console.log(`  @end (${fmtMs(durationMs)})  ${finals.join(":")}`);

const EXPECTED: Record<string, string[]> = {
  "2104a978-6965-4ea2-831a-f5eb661ae1ea": [
    "Theatre-verified (full log). Eagle(T0) 250 : Cobra(T1) 188 at 11:23.",
    "Waypoints: 2:00 ~8:45, 3:05 66:45, 4:34 67:104, 5:50 80:136, 6:32 103:137, 7:46 150:147,",
    "8:14 153:157, 9:37 202:157, 10:16 211:176, 11:04 219:188. Team totals must be exact.",
  ],
};
const expected = EXPECTED[MATCH_ID] ?? ["(no expected data for this match ID — blind test)"];
console.log("\n=== EXPECTED (from user) ===");
for (const line of expected) {
  console.log(line);
}
