/**
 * Exploratory analysis of Strongholds film data for a given match.
 *
 * Run: DOTENV_CONFIG_PATH=api/.dev.vars npx tsx api/scripts/strongholds-analysis.ts <matchId> [--events] [--byte2] [--raw]
 */
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { createScriptServices, fmtMs } from "./script-services";

const MATCH_ID = process.argv[2] ?? "9b15b756-0daa-446d-908e-b16a17925d9b";
const SHOW_EVENTS = process.argv.includes("--events");
const SHOW_BYTE2 = process.argv.includes("--byte2");
const SHOW_RAW = process.argv.includes("--raw");

const { haloService, haloFilmService } = await createScriptServices();

console.log(`\nAnalyzing Strongholds match: ${MATCH_ID}`);

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
  console.log(`  Team ${String(team.TeamId)}: Score=${String(team.Stats.CoreStats.Score)}`);
  if ("ZonesStats" in team.Stats) {
    const zones = team.Stats.ZonesStats;
    console.log(
      `    ZonesStats: ScoringTicks=${String(zones.StrongholdScoringTicks)} Captures=${String(zones.StrongholdCaptures)} Secures=${String(zones.StrongholdSecures)} OccupationTime=${zones.StrongholdOccupationTime} DefKills=${String(zones.StrongholdDefensiveKills)} OffKills=${String(zones.StrongholdOffensiveKills)}`,
    );
  }
}

{
  console.log(`\nPer-player ZonesStats (summed per team):`);
  const teamSums = new Map<number, { captures: number; secures: number; ticks: number; occupationS: number }>();
  for (const player of matchStats.Players) {
    for (const teamStats of player.PlayerTeamStats) {
      if ("ZonesStats" in teamStats.Stats) {
        const zones = teamStats.Stats.ZonesStats;
        const sums = teamSums.get(teamStats.TeamId) ?? { captures: 0, secures: 0, ticks: 0, occupationS: 0 };
        sums.captures += zones.StrongholdCaptures;
        sums.secures += zones.StrongholdSecures;
        sums.ticks += zones.StrongholdScoringTicks;
        sums.occupationS += getDurationInSeconds(zones.StrongholdOccupationTime);
        teamSums.set(teamStats.TeamId, sums);
      }
    }
  }
  for (const [teamId, sums] of [...teamSums.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(
      `  Team ${String(teamId)}: captures=${String(sums.captures)} secures=${String(sums.secures)} ticks=${String(sums.ticks)} occupation=${String(Math.round(sums.occupationS))}s`,
    );
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
  const perTeam = new Map<number, number>();
  for (const event of modeEvents) {
    perTeam.set(event.teamId ?? -1, (perTeam.get(event.teamId ?? -1) ?? 0) + 1);
  }
  console.log(
    `  per team: ${[...perTeam.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([teamId, count]) => `T${String(teamId)}:${String(count)}`)
      .join(" ")}`,
  );
}

if (SHOW_EVENTS || SHOW_RAW) {
  console.log(`\nAll mode events (timeline):`);
  for (const event of modeEvents) {
    console.log(
      `  ${fmtMs(event.timeMs)} (${String(event.timeMs)}ms) T${String(event.teamId ?? -1)} ${event.gamertag}`,
    );
  }
}

console.log(`\nByte2 transitions: ${String(byte2Transitions.length)} total`);
{
  const valueCounts = new Map<string, number>();
  for (const t of byte2Transitions) {
    const key = `0x${t.toValue.toString(16)}`;
    valueCounts.set(key, (valueCounts.get(key) ?? 0) + 1);
  }
  console.log(
    `  toValue counts: ${[...valueCounts.entries()]
      .sort((a, b) => parseInt(a[0], 16) - parseInt(b[0], 16))
      .map(([k, v]) => `${k}:${String(v)}`)
      .join(" ")}`,
  );
}

if (SHOW_BYTE2) {
  console.log(`\nAll byte2 transitions (compact, gameplay range 0x40-0x9f only):`);
  const lines = byte2Transitions
    .filter((t) => t.toValue >= 0x40 && t.toValue < 0xa0 && t.timeMs > 5000)
    .map((t) => `${fmtMs(t.timeMs)}|${String(t.timeMs)}|${t.fromValue.toString(16)}>${t.toValue.toString(16)}`);
  for (let i = 0; i < lines.length; i += 5) {
    console.log(`  ${lines.slice(i, i + 5).join("  ")}`);
  }
}
