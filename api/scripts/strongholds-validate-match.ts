/**
 * Validates Strongholds score reconstruction for a given match.
 *
 * Run: DOTENV_CONFIG_PATH=api/.dev.vars npx tsx api/scripts/strongholds-validate-match.ts <matchId>
 */
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { sampleScoreAt } from "../services/halo/modes/strongholds/strongholds-progression";
import { STRONGHOLDS_2104_THEATRE_WAYPOINTS } from "../services/halo/modes/strongholds/fakes/strongholds-match-2104.fake";
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

const progression = await haloFilmService.buildStrongholdsProgression(matchStats, durationMs);

const teamIds = matchStats.Teams.map((t) => t.TeamId).sort((a, b) => a - b);

console.log(`\nMinute-by-minute reconstruction (${String(progression.events.length)} curve points):`);
for (let minute = 1; minute * 60000 <= durationMs; minute++) {
  const scores = teamIds.map((id) => String(Math.round(sampleScoreAt(progression.events, id, minute * 60000))));
  console.log(`  @${String(minute)}:00  ${scores.join(":")}`);
}
const finals = teamIds.map((id) => String(Math.round(sampleScoreAt(progression.events, id, durationMs))));
console.log(`  @end (${fmtMs(durationMs)})  ${finals.join(":")}`);

const THEATRE_WAYPOINTS_BY_MATCH: Record<string, readonly (readonly [number, number, number])[]> = {
  "2104a978-6965-4ea2-831a-f5eb661ae1ea": STRONGHOLDS_2104_THEATRE_WAYPOINTS,
};
const waypoints = THEATRE_WAYPOINTS_BY_MATCH[MATCH_ID];
console.log("\n=== EXPECTED (theatre waypoints) ===");
if (waypoints == null) {
  console.log("(no expected data for this match ID — blind test)");
} else {
  let totalError = 0;
  for (const [seconds, team0Expected, team1Expected] of waypoints) {
    const team0 = sampleScoreAt(progression.events, teamIds[0] ?? 0, seconds * 1000);
    const team1 = sampleScoreAt(progression.events, teamIds[1] ?? 1, seconds * 1000);
    totalError += Math.abs(team0 - team0Expected) + Math.abs(team1 - team1Expected);
    console.log(
      `  @${fmtMs(seconds * 1000)}  model ${String(Math.round(team0))}:${String(Math.round(team1))}  theatre ${String(team0Expected)}:${String(team1Expected)}`,
    );
  }
  console.log(`  MAE: ${(totalError / (waypoints.length * 2)).toFixed(2)}`);
}
