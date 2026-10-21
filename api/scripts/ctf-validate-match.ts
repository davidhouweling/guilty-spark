/**
 * Validates the film-decoded CTF flag events for a match against the API's per-player
 * CaptureTheFlagStats, and prints the merged flag/kill/death timeline.
 *
 * Run: DOTENV_CONFIG_PATH=api/.dev.vars npx tsx api/scripts/ctf-validate-match.ts <matchId> [--events] [--json=<path>]
 * Exit code 1 when any decoded count differs from the API.
 */
import { writeFileSync } from "node:fs";
import type { MatchStats } from "halo-infinite-api";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import type { CtfFlagEvent, CtfFlagEventKind } from "../services/halo/statborg/types";
import { createScriptServices, enrichEventsWithTeamIds, fmtMs } from "./script-services";

const MATCH_ID = process.argv[2] ?? "5e3900a6-69ee-42f6-9a79-5146e8802a0c";
const SHOW_EVENTS = process.argv.includes("--events");
const JSON_OUT = process.argv.find((arg) => arg.startsWith("--json="))?.slice("--json=".length);

type CtfStatField =
  | "FlagSteals"
  | "FlagGrabs"
  | "FlagCaptures"
  | "FlagCaptureAssists"
  | "FlagReturns"
  | "FlagSecures"
  | "FlagCarriersKilled"
  | "FlagReturnersKilled";

const API_FIELD_BY_KIND: Record<CtfFlagEventKind, CtfStatField> = {
  steal: "FlagSteals",
  grab: "FlagGrabs",
  capture: "FlagCaptures",
  captureAssist: "FlagCaptureAssists",
  return: "FlagReturns",
  secure: "FlagSecures",
  carrierKilled: "FlagCarriersKilled",
  returnerKilled: "FlagReturnersKilled",
};
const KINDS: readonly CtfFlagEventKind[] = [
  "steal",
  "grab",
  "capture",
  "captureAssist",
  "return",
  "secure",
  "carrierKilled",
  "returnerKilled",
];
const API_FIELDS: readonly CtfStatField[] = KINDS.map((kind) => API_FIELD_BY_KIND[kind]);

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

function apiCtfCounts(player: MatchStats["Players"][number]): Record<CtfStatField, number> {
  const counts: Record<CtfStatField, number> = {
    FlagSteals: 0,
    FlagGrabs: 0,
    FlagCaptures: 0,
    FlagCaptureAssists: 0,
    FlagReturns: 0,
    FlagSecures: 0,
    FlagCarriersKilled: 0,
    FlagReturnersKilled: 0,
  };
  for (const teamStats of player.PlayerTeamStats) {
    if (!("CaptureTheFlagStats" in teamStats.Stats)) {
      continue;
    }
    const ctf = teamStats.Stats.CaptureTheFlagStats;
    for (const field of API_FIELDS) {
      counts[field] += ctf[field];
    }
  }
  return counts;
}

function decodedCounts(events: readonly CtfFlagEvent[], xuid: string): Record<CtfFlagEventKind, number> {
  const counts: Record<CtfFlagEventKind, number> = {
    steal: 0,
    grab: 0,
    capture: 0,
    captureAssist: 0,
    return: 0,
    secure: 0,
    carrierKilled: 0,
    returnerKilled: 0,
  };
  for (const event of events) {
    if (event.xuid === xuid) {
      counts[event.kind] += 1;
    }
  }
  return counts;
}

const { haloService, haloFilmService } = await createScriptServices();
const [matchStats] = await haloService.getMatchDetails([MATCH_ID]);
if (matchStats == null) {
  console.log("ERROR: Failed to fetch match stats");
  process.exit(1);
}
const info = matchStats.MatchInfo;
const durationMs = Math.round(getDurationInSeconds(info.Duration) * 1000);
console.log(
  `\nCTF match ${MATCH_ID}: mode ${String(info.GameVariantCategory)}, ${fmtMs(durationMs)}, map ${info.MapVariant.AssetId}/${info.MapVariant.VersionId}`,
);
for (const team of matchStats.Teams) {
  const ctf = "CaptureTheFlagStats" in team.Stats ? JSON.stringify(team.Stats.CaptureTheFlagStats) : "";
  console.log(`  Team ${String(team.TeamId)}: score ${String(team.Stats.CoreStats.Score)} ${ctf}`);
}

const startedAt = performance.now();
const { events: flagEvents, unresolvedSlots } = await haloFilmService.buildCtfFlagEvents(matchStats);
console.log(
  `\nDecoded ${String(flagEvents.length)} flag events in ${String(Math.round(performance.now() - startedAt))}ms; unresolved slots: ${JSON.stringify(unresolvedSlots)}`,
);

const highlightEvents = enrichEventsWithTeamIds(await haloFilmService.getHighlightEventsForMatch(MATCH_ID), matchStats);
const gamertagByXuid = new Map(highlightEvents.map((event) => [event.xuid, event.gamertag]));
const players = matchStats.Players.map((player) => {
  const xuid = unwrapXuid(player.PlayerId);
  return { xuid, team: player.LastTeamId, gamertag: gamertagByXuid.get(xuid) ?? xuid, player };
});

console.log(`\nDecoded vs API per player (decoded/api; * marks a mismatch):`);
let mismatches = 0;
for (const { xuid, team, gamertag, player } of players.sort((a, b) => a.team - b.team)) {
  const api = apiCtfCounts(player);
  const decoded = decodedCounts(flagEvents, xuid);
  const cells: string[] = [];
  for (const kind of KINDS) {
    const expected = api[API_FIELD_BY_KIND[kind]];
    const actual = decoded[kind];
    if (actual !== expected) {
      mismatches += 1;
    }
    cells.push(`${STAT_NAMES[kind]}=${String(actual)}/${String(expected)}${actual === expected ? "" : "*"}`);
  }
  console.log(`  T${String(team)} ${gamertag.padEnd(16)} ${cells.join(" ")}`);
}
console.log(
  mismatches === 0 ? `\nAll per-player counts match the API.` : `\n${String(mismatches)} count(s) differ from the API.`,
);

if (SHOW_EVENTS) {
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
}

if (JSON_OUT != null) {
  const payload = {
    matchId: MATCH_ID,
    durationMs,
    players: players.map(({ xuid, team, gamertag }) => ({ xuid, team, gamertag })),
    named: flagEvents.map((event) => ({ timeMs: event.timestampMs, stat: STAT_NAMES[event.kind], xuid: event.xuid })),
    deaths: highlightEvents.filter((e) => e.eventType === "death").map((e) => ({ timeMs: e.timeMs, xuid: e.xuid })),
    kills: highlightEvents.filter((e) => e.eventType === "kill").map((e) => ({ timeMs: e.timeMs, xuid: e.xuid })),
    modeEvents: highlightEvents.filter((e) => e.eventType === "mode").map((e) => ({ timeMs: e.timeMs, xuid: e.xuid })),
  };
  writeFileSync(JSON_OUT, JSON.stringify(payload, null, 1));
  console.log(`wrote ${JSON_OUT}`);
}

process.exit(mismatches === 0 ? 0 : 1);
