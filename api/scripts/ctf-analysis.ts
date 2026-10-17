/**
 * Exploratory analysis of CTF film data for a given match.
 *
 * Run: DOTENV_CONFIG_PATH=api/.dev.vars npx tsx api/scripts/ctf-analysis.ts <matchId> [--events]
 */
import { getDurationInSeconds } from "@guilty-spark/shared/halo/duration";
import { unwrapXuid } from "@guilty-spark/shared/halo/match-stats";
import { createScriptServices, enrichEventsWithTeamIds, fmtMs } from "./script-services";

const MATCH_ID = process.argv[2] ?? "5e3900a6-69ee-42f6-9a79-5146e8802a0c";
const SHOW_EVENTS = process.argv.includes("--events");

const { haloService, haloFilmService } = await createScriptServices();

console.log(`\nAnalyzing CTF match: ${MATCH_ID}`);
const [matchStats] = await haloService.getMatchDetails([MATCH_ID]);
if (matchStats == null) {
  console.log("ERROR: Failed to fetch match stats");
  process.exit(1);
}
const durationMs = Math.round(getDurationInSeconds(matchStats.MatchInfo.Duration) * 1000);
const info = matchStats.MatchInfo;
console.log(
  `Mode: ${String(info.GameVariantCategory)}, durationMs: ${String(durationMs)} (${fmtMs(durationMs)}), map ${info.MapVariant.AssetId}/${info.MapVariant.VersionId}, variant ${info.UgcGameVariant.AssetId}/${info.UgcGameVariant.VersionId}`,
);
console.log(`Playlist: ${JSON.stringify(info.Playlist)} LevelId ${info.LevelId}`);

console.log(`\nTeam stats (API):`);
for (const team of matchStats.Teams) {
  console.log(
    `  Team ${String(team.TeamId)}: Score=${String(team.Stats.CoreStats.Score)} Outcome=${String(team.Outcome)}`,
  );
  if ("CaptureTheFlagStats" in team.Stats) {
    console.log(`    ${JSON.stringify(team.Stats.CaptureTheFlagStats)}`);
  }
}

console.log(`\nPer-player CTF stats:`);
const players = matchStats.Players.map((p) => ({ xuid: unwrapXuid(p.PlayerId), teamId: p.LastTeamId, p }));
for (const { xuid, teamId, p } of players.sort((a, b) => a.teamId - b.teamId)) {
  for (const ts of p.PlayerTeamStats) {
    const core = ts.Stats.CoreStats;
    const ctf = "CaptureTheFlagStats" in ts.Stats ? ts.Stats.CaptureTheFlagStats : null;
    console.log(
      `  T${String(teamId)} ${xuid} K/D/A=${String(core.Kills)}/${String(core.Deaths)}/${String(core.Assists)} score=${String(core.PersonalScore)} ${ctf ? JSON.stringify(ctf) : ""}`,
    );
  }
}

const events = enrichEventsWithTeamIds(await haloFilmService.getHighlightEventsForMatch(MATCH_ID), matchStats);
const byType = new Map<string, number>();
for (const e of events) {
  byType.set(e.eventType, (byType.get(e.eventType) ?? 0) + 1);
}
console.log(`\nFilm highlight events: ${JSON.stringify([...byType.entries()])}`);
const modeEvents = events.filter((e) => e.eventType === "mode");
const perTeam = new Map<number, number>();
for (const e of modeEvents) {
  perTeam.set(e.teamId ?? -1, (perTeam.get(e.teamId ?? -1) ?? 0) + 1);
}
console.log(`Mode events per team: ${JSON.stringify([...perTeam.entries()])}`);
const perPlayer = new Map<string, number>();
for (const e of modeEvents) {
  perPlayer.set(`T${String(e.teamId)} ${e.gamertag}`, (perPlayer.get(`T${String(e.teamId)} ${e.gamertag}`) ?? 0) + 1);
}
console.log(`Mode events per player: ${JSON.stringify([...perPlayer.entries()])}`);

if (SHOW_EVENTS) {
  console.log(`\nTimeline (mode + kill/death):`);
  for (const e of events.filter((x) => x.eventType !== "medal").sort((a, b) => a.timeMs - b.timeMs)) {
    console.log(
      `  ${fmtMs(e.timeMs)} ${String(e.timeMs).padStart(7)} ${e.eventType.padEnd(5)} T${String(e.teamId)} ${e.gamertag}`,
    );
  }
}
