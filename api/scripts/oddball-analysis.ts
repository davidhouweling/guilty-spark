/**
 * Exploratory analysis of Oddball film data for a given match.
 *
 * Run: DOTENV_CONFIG_PATH=api/.dev.vars npx tsx api/scripts/oddball-analysis.ts <matchId> [--events]
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MATCH_ID = process.argv[2] ?? "3a8dab3d-63c0-46b1-9041-5a5b4ef9eeb4";
const SHOW_EVENTS = process.argv.includes("--events");
const SHOW_BYTE2 = process.argv.includes("--byte2");
const SHOW_RAW = process.argv.includes("--raw");

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

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60).toString()}:${(s % 60).toString().padStart(2, "0")}`;
}

console.log(`\nAnalyzing Oddball match: ${MATCH_ID}`);

const [matchStats] = await haloService.getMatchDetails([MATCH_ID]);
if (matchStats == null) {
  console.log("ERROR: Failed to fetch match stats");
  process.exit(1);
}

const durationMs = Math.round(getDurationInSeconds(matchStats.MatchInfo.Duration) * 1000);
console.log(
  `Mode: ${String(matchStats.MatchInfo.GameVariantCategory)}, durationMs: ${String(durationMs)} (${fmtMs(durationMs)})`,
);

console.log(`\nTeam stats (API):`);
for (const team of matchStats.Teams) {
  console.log(
    `  Team ${String(team.TeamId)}: Score=${String(team.Stats.CoreStats.Score)} RoundsWon=${String(team.Stats.CoreStats.RoundsWon)}`,
  );
  if ("OddballStats" in team.Stats) {
    const oddball = team.Stats.OddballStats;
    console.log(
      `    OddballStats: ScoringTicks=${String(oddball.SkullScoringTicks)} Grabs=${String(oddball.SkullGrabs)} TimeAsCarrier=${oddball.TimeAsSkullCarrier} Longest=${oddball.LongestTimeAsSkullCarrier}`,
    );
  }
}

{
  console.log(`\nPer-player OddballStats (summed per team):`);
  const teamSums = new Map<number, { grabs: number; ticks: number }>();
  for (const player of matchStats.Players) {
    for (const teamStats of player.PlayerTeamStats) {
      if ("OddballStats" in teamStats.Stats) {
        const oddball = teamStats.Stats.OddballStats;
        const sums = teamSums.get(teamStats.TeamId) ?? { grabs: 0, ticks: 0 };
        sums.grabs += oddball.SkullGrabs;
        sums.ticks += oddball.SkullScoringTicks;
        teamSums.set(teamStats.TeamId, sums);
      }
    }
  }
  for (const [teamId, sums] of [...teamSums.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  Team ${String(teamId)}: totalGrabs=${String(sums.grabs)} totalScoringTicks=${String(sums.ticks)}`);
  }
}

const xuidToTeamId = new Map<string, number>();
for (const player of matchStats.Players) {
  xuidToTeamId.set(unwrapXuid(player.PlayerId), player.LastTeamId);
}

const [events, byte2Transitions] = await Promise.all([
  haloFilmService.getHighlightEventsForMatch(MATCH_ID),
  haloFilmService.getStateByte2Transitions(MATCH_ID),
]);

const modeEvents = events
  .map((event) => ({ ...event, teamId: xuidToTeamId.get(event.xuid) ?? null }))
  .filter((event) => event.eventType === "mode" && event.teamId != null);

console.log(`\nMode events: ${String(modeEvents.length)} total`);
{
  const signatures = new Map<string, number>();
  for (const event of modeEvents) {
    const key = `hint=${String(event.typeHint)} medal=${String(event.medalValue)} isMedal=${String(event.isMedal)}`;
    signatures.set(key, (signatures.get(key) ?? 0) + 1);
  }
  console.log(`  signatures: ${[...signatures.entries()].map(([k, v]) => `[${k}]x${String(v)}`).join(" ")}`);
  const eventTypes = new Map<string, number>();
  for (const event of events) {
    eventTypes.set(event.eventType, (eventTypes.get(event.eventType) ?? 0) + 1);
  }
  console.log(`  all event types: ${[...eventTypes.entries()].map(([k, v]) => `${k}:${String(v)}`).join(" ")}`);
}

const byTeam = new Map<number, number[]>();
for (const event of modeEvents) {
  const teamId = event.teamId ?? -1;
  const list = byTeam.get(teamId) ?? [];
  list.push(event.timeMs);
  byTeam.set(teamId, list);
}

for (const [teamId, times] of [...byTeam.entries()].sort((a, b) => a[0] - b[0])) {
  const gaps = times.slice(1).map((t, i) => t - (times[i] ?? 0));
  const buckets = new Map<string, number>();
  for (const gap of gaps) {
    const bucket =
      gap < 1500 ? "<1.5s" : gap < 3500 ? "1.5-3.5s" : gap < 7500 ? "3.5-7.5s" : gap < 15000 ? "7.5-15s" : ">=15s";
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  const bucketStr = [...buckets.entries()].map(([k, v]) => `${k}:${String(v)}`).join(" ");
  console.log(
    `  Team ${String(teamId)}: ${String(times.length)} events, first=${fmtMs(times[0] ?? 0)}, last=${fmtMs(times.at(-1) ?? 0)}, gap buckets: ${bucketStr}`,
  );
}

{
  const allTimes = events
    .filter((e) => e.eventType === "kill" || e.eventType === "death" || e.eventType === "mode")
    .map((e) => e.timeMs)
    .sort((a, b) => a - b);
  console.log(`\nAll-activity gaps >= 15s (kills+deaths+mode; round-break candidates):`);
  for (let i = 1; i < allTimes.length; i++) {
    const prev = allTimes[i - 1] ?? 0;
    const curr = allTimes[i] ?? 0;
    if (curr - prev >= 15000) {
      console.log(`  ${fmtMs(prev)} -> ${fmtMs(curr)} (${String(Math.round((curr - prev) / 1000))}s)`);
    }
  }
  const modeGaps: number[] = [];
  for (const [, times] of byTeam) {
    for (let i = 1; i < times.length; i++) {
      modeGaps.push((times[i] ?? 0) - (times[i - 1] ?? 0));
    }
  }
  const hist = new Map<number, number>();
  for (const gap of modeGaps.filter((g) => g < 12000)) {
    const bin = Math.floor(gap / 1000);
    hist.set(bin, (hist.get(bin) ?? 0) + 1);
  }
  const histStr = [...hist.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bin, count]) => `${String(bin)}s:${String(count)}`)
    .join(" ");
  console.log(`\nMode-event same-team gap histogram (<12s, 1s bins): ${histStr}`);
}

console.log(`\nByte2 transitions: ${String(byte2Transitions.length)} total`);
const valueCounts = new Map<string, number>();
for (const t of byte2Transitions) {
  const key = `0x${t.toValue.toString(16)}`;
  valueCounts.set(key, (valueCounts.get(key) ?? 0) + 1);
}
console.log(`  toValue counts: ${[...valueCounts.entries()].map(([k, v]) => `${k}:${String(v)}`).join(" ")}`);
console.log(`  Non-gameplay transitions (toValue outside 0x40-0x9f):`);
for (const t of byte2Transitions) {
  if (t.toValue < 0x40 || t.toValue >= 0xa0) {
    console.log(
      `    ${fmtMs(t.timeMs)} (${String(t.timeMs)}ms) 0x${t.fromValue.toString(16)} -> 0x${t.toValue.toString(16)}`,
    );
  }
}

if (SHOW_RAW) {
  console.log(`\nRaw events (all types, with xuid):`);
  for (const event of events) {
    if (event.eventType !== "medal") {
      const teamId = xuidToTeamId.get(event.xuid);
      console.log(
        `  ${String(event.timeMs)}|${event.eventType}|T${String(teamId ?? -1)}|${event.xuid}|${event.gamertag}`,
      );
    }
  }
}

if (SHOW_BYTE2) {
  console.log(`\nAll byte2 transitions (compact):`);
  const lines = byte2Transitions.map(
    (t) => `${fmtMs(t.timeMs)}|${String(t.timeMs)}|${t.fromValue.toString(16)}>${t.toValue.toString(16)}`,
  );
  for (let i = 0; i < lines.length; i += 6) {
    console.log(`  ${lines.slice(i, i + 6).join("  ")}`);
  }
}

if (SHOW_EVENTS) {
  console.log(`\nAll mode events (cumulative per team):`);
  const running = new Map<number, number>();
  for (const event of modeEvents) {
    const teamId = event.teamId ?? -1;
    running.set(teamId, (running.get(teamId) ?? 0) + 1);
    const totals = [...running.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, count]) => `T${String(id)}:${String(count)}`)
      .join(" ");
    console.log(`  T${String(teamId)} @ ${fmtMs(event.timeMs)} (${String(event.timeMs)}ms) [${totals}]`);
  }
}
