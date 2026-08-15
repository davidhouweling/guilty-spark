/**
 * Validates KOTH analytics output for a given match.
 *
 * Run: DOTENV_CONFIG_PATH=api/.dev.vars npx tsx api/scripts/koth-validate-match.ts <matchId>
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
import { AnalyticsService } from "../services/analytics/analytics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATCH_ID = process.argv[2] ?? "72c3006a-82fc-48a2-8a2f-f862b675f984";

// ─── Setup ───────────────────────────────────────────────────────────────────

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
const haloFilmService = new HaloFilmService({ env, spartanTokenProvider });
const analyticsService = new AnalyticsService({ haloService, haloFilmService, logService });

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60).toString()}:${(s % 60).toString().padStart(2, "0")}`;
}

// ─── Fetch match + analytics ─────────────────────────────────────────────────

console.log(`\nValidating KOTH match: ${MATCH_ID}`);

const [matchStats] = await haloService.getMatchDetails([MATCH_ID]);
if (matchStats == null) {
  console.log("ERROR: Failed to fetch match stats");
  process.exit(1);
}

console.log(`\nTeam scores (API):`);
for (const team of matchStats.Teams) {
  console.log(`  Team ${String(team.TeamId)}: Score=${String(team.Stats.CoreStats.Score)}`);
}

const analyticsResult = await analyticsService.getBatchMatchAnalytics([MATCH_ID], ["scoreProgression"]);
const analytics = analyticsResult[MATCH_ID];
const progression = analytics?.scoreProgression;

if (progression == null) {
  console.log("\nERROR: No scoreProgression returned");
  process.exit(1);
}

console.log(
  `\nMode: ${String(progression.mode)}, durationMs: ${String(progression.durationMs)} (${fmtMs(progression.durationMs)})`,
);

if (progression.timeline.type !== "objective-control") {
  console.log(`\nERROR: Expected objective-control timeline, got: ${progression.timeline.type}`);
  process.exit(1);
}

const { hillCaptureTimestamps, controlPeriods, events } = progression.timeline;

console.log(`\nhillCaptureTimestamps (${String(hillCaptureTimestamps.length)}):`);
for (const ts of hillCaptureTimestamps) {
  console.log(`  ${fmtMs(ts)} (${String(ts)}ms)`);
}

console.log(`\ncontrolPeriods (${String(controlPeriods.length)}):`);
for (const cp of controlPeriods) {
  console.log(`  [${fmtMs(cp.startMs)} → ${fmtMs(cp.endMs)}] team=${String(cp.controllingTeamId ?? "null")}`);
}

console.log(`\nAll score events:`);
for (const e of events) {
  const scores = Object.entries(e.runningScores)
    .map(([k, v]) => `T${k}:${String(v)}`)
    .join(" ");
  console.log(`  Team ${String(e.teamId)} @ ${fmtMs(e.timestampMs)} (${String(e.timestampMs)}ms) [${scores}]`);
}

// ─── Simulate formatter output ───────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log("SIMULATED FORMATTER OUTPUT (from buildKothHills)");
console.log("=".repeat(50));

const TEAM_COLORS = [
  { teamId: 0, color: "#0000ff", name: "Eagle" },
  { teamId: 1, color: "#ff0000", name: "Cobra" },
];
interface HillPeriod {
  startMs: number;
  endMs: number;
  isCaptured: boolean;
}
// Mirrors buildKothHills in the pages formatter: trailing slivers under 2s are dropped and the
// winner comes from the capturing team's score event at the hill boundary.
const MIN_TRAILING_HILL_MS = 2_000;
const hillPeriods: HillPeriod[] = [];
let hillStart = 0;
for (const captureTs of hillCaptureTimestamps) {
  hillPeriods.push({ startMs: hillStart, endMs: captureTs, isCaptured: true });
  hillStart = captureTs;
}
if (progression.durationMs - hillStart >= MIN_TRAILING_HILL_MS) {
  hillPeriods.push({ startMs: hillStart, endMs: progression.durationMs, isCaptured: false });
}

for (const [i, period] of hillPeriods.entries()) {
  const hillIndex = i + 1;
  const capturingEvent = period.isCaptured ? events.findLast((e) => e.timestampMs === period.endMs) : null;
  const winnerTeamId = capturingEvent?.teamId ?? null;
  const winnerName =
    winnerTeamId != null ? (TEAM_COLORS.find((t) => t.teamId === winnerTeamId)?.name ?? "?") : "(none)";

  const hillDurationMs = period.endMs - period.startMs;

  // Compute occupancy from controlPeriods
  const holdMs = new Map<number, number>();
  for (const cp of controlPeriods) {
    if (cp.controllingTeamId == null) {
      continue;
    }
    const segStart = Math.max(cp.startMs, period.startMs);
    const segEnd = Math.min(cp.endMs, period.endMs);
    if (segEnd > segStart) {
      holdMs.set(cp.controllingTeamId, (holdMs.get(cp.controllingTeamId) ?? 0) + (segEnd - segStart));
    }
  }

  const occupancies = TEAM_COLORS.map((t) => ({
    name: t.name,
    pct: hillDurationMs > 0 ? Math.round(((holdMs.get(t.teamId) ?? 0) / hillDurationMs) * 100) : 0,
  }));

  const occupancyStr = occupancies.map((o) => `${o.name} ${String(o.pct)}%`).join(", ");

  console.log(`\nHill ${String(hillIndex)} [${fmtMs(period.startMs)} → ${fmtMs(period.endMs)}]`);
  console.log(`  Winner: ${winnerName} (isCaptured=${String(period.isCaptured)})`);
  console.log(`  Occupancy: ${occupancyStr}`);
}

const EXPECTED: Record<string, string[]> = {
  "72c3006a-82fc-48a2-8a2f-f862b675f984": [
    "Hill 1: ~2:36 end, Eagle wins, Cobra ~30%",
    "Hill 2: ~4:28 end, Eagle wins, Cobra ~95%",
    "Hill 3: ~7:02 end, Eagle wins, Cobra ~70%",
    "Hill 4: never captured, ~10:07 end, Eagle ~15%, Cobra ~50%",
    "Final score: 3:0 Eagle",
  ],
  "5c39e8a4-1986-4221-8c9e-dbb46fdfe2ca": [
    "Hill 1: ~3:14 end, Eagle wins",
    "Hill 2: ~5:03 end, Eagle wins, Cobra 0% (never in hill)",
    "Hill 3: ~7:00 end, Cobra wins, Eagle meter was at 80%",
    "Hill 4: never captured, ~9:36 end, Eagle 20% meter, Cobra 10% meter",
    "Final score: 2:1 Eagle",
  ],
  "f5a8c16b-f99c-489f-a34a-825a9d256a4d": [
    "Hill 1: ~4:04 end, Cobra wins — at 3:48 Eagle ~90% / Cobra ~80%, still 0:0; Eagle ~90% at capture",
    "Hill 2: ~5:28 end, Eagle wins, Cobra ~30%",
    "Hill 3: ~7:53 end, Eagle wins, Cobra ~60%",
    "Hill 4: ~9:56 end, Eagle wins, Cobra ~25%",
    "Hill 5: ~10:49 end, Cobra wins, Eagle 0%",
    "Hill 6: never captured, clock runs out ~11:34 — Eagle ~2%, Cobra ~10-15%",
    "Final score: 3:2 Eagle",
  ],
  "93f5e373-8984-4714-915c-e55b31c8404e": [
    "Hill 1: ~2:00 end, Cobra wins, Eagle ~35-40%",
    "Hill 2: ~3:49 end, Cobra wins — Eagle hit 95% at 2:55 but did NOT capture (off hill 2:44-3:49)",
    "Hill 3: ~5:37 end, Cobra wins, Eagle ~60%",
    "Hill 4: ~6:32 end, Eagle wins, Cobra 0%",
    "Hill 5: ~8:01 end, Eagle wins, Cobra ~5%",
    "Hill 6: ~9:28 end, Eagle wins, Cobra ~40%",
    "Hill 7: ~12:20 end, Eagle wins, Cobra ~60% — capture ends the match",
    "Final score: 4:3 Eagle",
  ],
  "3a1dd96b-35e8-46e4-997a-abe592ad195a": [
    "Eagle started with 1 pre-awarded hill (lobby-configured) — only 4 in-film hills",
    "Hill 1: ~2:45 end, Cobra wins, Eagle meter was at ~95%",
    "Hill 2: ~4:42 end, Eagle wins, Cobra ~50%",
    "Hill 3: ~6:34 end, Eagle wins, Cobra ~85-90%",
    "Hill 4: ~8:14 end, Eagle wins, Cobra ~80% — capture ends the match",
    "Final score: 4:1 Eagle (3:1 in-film)",
  ],
};
const expected = EXPECTED[MATCH_ID] ?? ["(no expected data for this match ID)"];
console.log("\n=== EXPECTED (from user) ===");
for (const line of expected) {
  console.log(line);
}
