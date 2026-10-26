/**
 * Prints the CTF flag runs the analytics producer would emit for a match: stands, per-run
 * outcome, markers and a progress sparkline, for comparison against theatre.
 *
 * Run: DOTENV_CONFIG_PATH=api/.dev.vars npx tsx api/scripts/ctf-validate-progression.ts <matchId>
 */
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { createScriptServices, fmtMs } from "./script-services";

const MATCH_ID = process.argv.slice(2).find((arg) => !arg.startsWith("--")) ?? "5e3900a6-69ee-42f6-9a79-5146e8802a0c";

const { haloService, haloFilmService } = await createScriptServices();
const [matchStats] = await haloService.getMatchDetails([MATCH_ID]);
if (matchStats == null) {
  console.log("ERROR: Failed to fetch match stats");
  process.exit(1);
}
const durationMs = Math.round(getDurationInSeconds(matchStats.MatchInfo.Duration) * 1000);
const startedAt = performance.now();
const progression = await haloFilmService.buildCtfProgression(matchStats, durationMs);
console.log(
  `Built in ${String(Math.round(performance.now() - startedAt))}ms: ${String(progression.events.length)} captures, ${String(progression.runs.length)} runs, ${String(progression.deathTimeline.length)} deaths`,
);
for (const event of progression.events) {
  console.log(
    `  capture ${fmtMs(event.timestampMs)} T${String(event.teamId)} -> ${JSON.stringify(event.runningScores)}`,
  );
}
for (const run of progression.runs) {
  const peak = Math.max(0, ...run.samples.map((sample) => sample.progress));
  const spark = run.samples
    .filter((_, index) => index % 4 === 0)
    .map((sample) => "▁▂▃▄▅▆▇█"[Math.min(7, Math.floor(sample.progress * 8))])
    .join("");
  console.log(
    `\nFlag T${String(run.flagTeamId)} by T${String(run.carrierTeamId)}: ${fmtMs(run.startMs)} -> ${fmtMs(run.endMs)} ${run.outcome} peak ${String(Math.round(peak * 100))}% (${String(run.samples.length)} samples)`,
  );
  console.log(`  ${run.events.map((event) => `${fmtMs(event.timestampMs)} ${event.kind}`).join(", ")}`);
  console.log(`  ${spark}`);
}
