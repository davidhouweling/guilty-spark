/**
 * Validates Strongholds score reconstruction for a given match.
 *
 * Run: DOTENV_CONFIG_PATH=api/.dev.vars npx tsx api/scripts/strongholds-validate-match.ts <matchId>
 */
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { buildStrongholdsProgression, sampleScoreAt } from "../services/halo/modes/strongholds/strongholds-progression";
import { createScriptServices, fmtMs } from "./script-services";

const MATCH_ID = process.argv[2] ?? "2104a978-6965-4ea2-831a-f5eb661ae1ea";

const { haloService, haloFilmService } = await createScriptServices();

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

console.log(`\nMinute-by-minute reconstruction (${String(progression.events.length)} curve points):`);
for (let minute = 1; minute * 60000 <= durationMs; minute++) {
  const scores = teamIds.map((id) => String(Math.round(sampleScoreAt(progression.events, id, minute * 60000))));
  console.log(`  @${String(minute)}:00  ${scores.join(":")}`);
}
const finals = teamIds.map((id) => String(Math.round(sampleScoreAt(progression.events, id, durationMs))));
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
