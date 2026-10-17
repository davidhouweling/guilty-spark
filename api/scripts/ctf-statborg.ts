/**
 * Prints the per-player CTF flag events decoded from a match film's statborg entity records
 * (see api/services/halo/statborg) merged with the footer kill/death/mode events.
 *
 * Run: DOTENV_CONFIG_PATH=api/.dev.vars npx tsx api/scripts/ctf-statborg.ts <matchId> [--json=<path>]
 */
import { writeFileSync } from "node:fs";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import type { CtfFlagEventKind } from "../services/halo/statborg/types";
import { createScriptServices, enrichEventsWithTeamIds, fmtMs } from "./script-services";

const MATCH_ID = process.argv[2] ?? "5e3900a6-69ee-42f6-9a79-5146e8802a0c";
const JSON_OUT = process.argv.find((arg) => arg.startsWith("--json="))?.slice("--json=".length);

const STAT_NAMES: Record<CtfFlagEventKind, string> = {
  steal: "steal",
  grab: "grab",
  capture: "capture",
  captureAssist: "capture_assist",
  return: "return",
  secure: "secure",
  carrierKilled: "carrier_killed",
  returnerKilled: "returner_killed",
};

const { haloService, haloFilmService } = await createScriptServices();
const [matchStats] = await haloService.getMatchDetails([MATCH_ID]);
if (matchStats == null) {
  console.log("ERROR: Failed to fetch match stats");
  process.exit(1);
}
const durationMs = Math.round(getDurationInSeconds(matchStats.MatchInfo.Duration) * 1000);

const startedAt = performance.now();
const { events: flagEvents, unresolvedSlots } = await haloFilmService.buildCtfFlagEvents(matchStats);
console.log(
  `Flag events: ${String(flagEvents.length)} in ${String(Math.round(performance.now() - startedAt))}ms; unresolved slots: ${JSON.stringify(unresolvedSlots)}`,
);

const highlightEvents = enrichEventsWithTeamIds(await haloFilmService.getHighlightEventsForMatch(MATCH_ID), matchStats);
const gamertagByXuid = new Map(highlightEvents.map((event) => [event.xuid, event.gamertag]));
const players = matchStats.Players.map((player) => {
  const xuid = unwrapXuid(player.PlayerId);
  return { xuid, team: player.LastTeamId, gamertag: gamertagByXuid.get(xuid) ?? xuid };
});

console.log(`\nPer player:`);
const counts = new Map<string, number>();
for (const event of flagEvents) {
  const key = `T${String(event.teamId)} ${gamertagByXuid.get(event.xuid) ?? event.xuid} ${STAT_NAMES[event.kind]}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
for (const [key, count] of [...counts.entries()].sort()) {
  console.log(`  ${key}: ${String(count)}`);
}

console.log(`\nMerged timeline:`);
const rows = flagEvents.map((event) => ({
  timeMs: event.timestampMs,
  text: `${STAT_NAMES[event.kind].toUpperCase().padEnd(15)} T${String(event.teamId)} ${gamertagByXuid.get(event.xuid) ?? event.xuid}`,
}));
for (const event of highlightEvents) {
  if (event.eventType !== "medal") {
    rows.push({
      timeMs: event.timeMs,
      text: `${event.eventType.padEnd(15)} T${String(event.teamId)} ${event.gamertag}`,
    });
  }
}
for (const row of rows.sort((left, right) => left.timeMs - right.timeMs)) {
  console.log(`  ${fmtMs(row.timeMs)} ${String(row.timeMs).padStart(7)} ${row.text}`);
}

if (JSON_OUT != null) {
  const payload = {
    matchId: MATCH_ID,
    durationMs,
    players,
    named: flagEvents.map((event) => ({ timeMs: event.timestampMs, stat: STAT_NAMES[event.kind], xuid: event.xuid })),
    deaths: highlightEvents.filter((e) => e.eventType === "death").map((e) => ({ timeMs: e.timeMs, xuid: e.xuid })),
    kills: highlightEvents.filter((e) => e.eventType === "kill").map((e) => ({ timeMs: e.timeMs, xuid: e.xuid })),
    modeEvents: highlightEvents.filter((e) => e.eventType === "mode").map((e) => ({ timeMs: e.timeMs, xuid: e.xuid })),
  };
  writeFileSync(JSON_OUT, JSON.stringify(payload, null, 1));
  console.log(`wrote ${JSON_OUT}`);
}
