/**
 * Validates Oddball round/score reconstruction for a given match.
 *
 * Run: DOTENV_CONFIG_PATH=api/.dev.vars npx tsx api/scripts/oddball-validate-match.ts <matchId>
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
import { buildOddballProgression } from "../services/halo/modes/oddball/oddball-progression";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATCH_ID = process.argv[2] ?? "3a8dab3d-63c0-46b1-9041-5a5b4ef9eeb4";

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

console.log(`\nValidating Oddball match: ${MATCH_ID}`);

const [matchStats] = await haloService.getMatchDetails([MATCH_ID]);
if (matchStats == null) {
  console.log("ERROR: Failed to fetch match stats");
  process.exit(1);
}

const durationMs = Math.round(getDurationInSeconds(matchStats.MatchInfo.Duration) * 1000);
console.log(`durationMs: ${String(durationMs)} (${fmtMs(durationMs)})`);
for (const team of matchStats.Teams) {
  console.log(
    `  Team ${String(team.TeamId)}: Score=${String(team.Stats.CoreStats.Score)} RoundsWon=${String(team.Stats.CoreStats.RoundsWon)}`,
  );
}

const xuidToTeamId = new Map<string, number>();
for (const player of matchStats.Players) {
  xuidToTeamId.set(unwrapXuid(player.PlayerId), player.LastTeamId);
}
const rawEvents = await haloFilmService.getHighlightEventsForMatch(MATCH_ID);
const events = rawEvents.map((event) => ({ ...event, teamId: xuidToTeamId.get(event.xuid) ?? null }));

const progression = buildOddballProgression(events, matchStats, durationMs);

const teamIds = matchStats.Teams.map((t) => t.TeamId).sort((a, b) => a - b);
const scoreStr = (scores: Record<string, number>): string =>
  teamIds.map((id) => String(scores[String(id)] ?? 0)).join(":");

for (const round of progression.rounds) {
  console.log(
    `\nRound ${String(round.roundIndex + 1)} [${fmtMs(round.startMs)} -> ${fmtMs(round.endMs)}] ` +
      `${round.endedByCap ? "CAP" : "TIME-OUT"} winner=Team ${String(round.winnerTeamId ?? -1)} ` +
      `final ${scoreStr(round.scores)}`,
  );
  // minute-by-minute cumulative estimates for interval spot checks
  const roundEndMinute = Math.ceil(round.endMs / 60000);
  for (let minute = Math.ceil(round.startMs / 60000); minute <= roundEndMinute; minute++) {
    const upto = Math.min(minute * 60000, round.endMs);
    const latest = [...round.points].reverse().find((p) => p.timestampMs <= upto);
    const scores = latest?.runningScores ?? Object.fromEntries(teamIds.map((id) => [String(id), 0]));
    console.log(`  @${fmtMs(upto)}  ${scoreStr(scores)}`);
  }
}

const EXPECTED: Record<string, string[]> = {
  "3a8dab3d-63c0-46b1-9041-5a5b4ef9eeb4": [
    "R1: ends 7:31 TIME-OUT, Eagle wins 61:47",
    "R2: 7:43-14:32 CAP, Cobra wins 23:100",
    "R3: 14:44-22:28 TIME-OUT, Cobra wins 72:73 (waypoints 16:40 24:1, 18:20 63:11, 20:00 63:32, 21:00 69:46, 22:00 70:69)",
    "Final: Cobra wins 2-1 (totals 156:220)",
  ],
};
const expected = EXPECTED[MATCH_ID] ?? ["(no expected data for this match ID)"];
console.log("\n=== EXPECTED (from user) ===");
for (const line of expected) {
  console.log(line);
}
