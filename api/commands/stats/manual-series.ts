import type { MatchStats } from "halo-infinite-api";
import type { APIGuildMember } from "discord-api-types/v10";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import type { SeriesOverviewTeam } from "../../embeds/stats/series-overview-embed";

export const MANUAL_QUEUE_NUMBER_MIN = 1_000_000_000;

/**
 * Manual series without a queue number use the UTC creation time as `YYYYMMDDHHmmss`, well above real NeatQueue numbers.
 */
export function allocateManualQueueNumber(now: Date = new Date()): number {
  return Number(now.toISOString().replace(/\D/g, "").slice(0, 14));
}

export interface ManualSeriesPlayer {
  readonly xuid: string;
  readonly gamertag: string;
  readonly discordId: string | null;
}

export interface ManualSeriesTeam {
  readonly name: string;
  readonly players: readonly ManualSeriesPlayer[];
}

function normaliseName(name: string): string {
  return name.replace(/\s/g, "").toLowerCase();
}

function getFinalMatchPlayers(finalMatch: MatchStats): MatchStats["Players"] {
  return finalMatch.Players.filter((player) => player.PlayerType === 1 && player.ParticipationInfo.PresentAtCompletion);
}

export function getManualSeriesFinalMatch(series: readonly MatchStats[]): MatchStats | undefined {
  return [...series].sort((left, right) => right.MatchInfo.StartTime.localeCompare(left.MatchInfo.StartTime))[0];
}

export function getManualSeriesPlayerXuids(finalMatch: MatchStats): string[] {
  return getFinalMatchPlayers(finalMatch).map((player) => getPlayerXuid(player));
}

/**
 * Teams come from the final game, mirroring a NeatQueue series' final rosters.
 */
export function deriveManualSeriesTeams(
  finalMatch: MatchStats,
  xuidToGamertag: ReadonlyMap<string, string>,
  xuidToDiscordId: ReadonlyMap<string, string>,
): ManualSeriesTeam[] {
  const players = getFinalMatchPlayers(finalMatch);

  return [...finalMatch.Teams]
    .sort((left, right) => left.TeamId - right.TeamId)
    .map((team) => ({
      name: getTeamName(team.TeamId),
      players: players
        .filter((player) => player.LastTeamId === team.TeamId)
        .map((player) => {
          const xuid = getPlayerXuid(player);
          return {
            xuid,
            gamertag: xuidToGamertag.get(xuid) ?? xuid,
            discordId: xuidToDiscordId.get(xuid) ?? null,
          };
        }),
    }));
}

export function toSeriesOverviewTeams(teams: readonly ManualSeriesTeam[]): SeriesOverviewTeam[] {
  return teams.map((team) => ({
    name: team.name,
    playerIds: team.players.flatMap((player) => (player.discordId == null ? [] : [player.discordId])),
    unlinkedGamertags: team.players.flatMap((player) => (player.discordId == null ? [player.gamertag] : [])),
  }));
}

/**
 * Picks the single guild member whose nickname, display name or username equals the gamertag, ignoring case and
 * spaces; ambiguous matches are rejected.
 */
export function findGuildMemberIdForGamertag(gamertag: string, members: readonly APIGuildMember[]): string | undefined {
  const normalisedGamertag = normaliseName(gamertag);
  const matchingIds = new Set(
    members
      .filter((member) =>
        [member.nick, member.user.global_name, member.user.username].some(
          (name) => name != null && normaliseName(name) === normalisedGamertag,
        ),
      )
      .map((member) => member.user.id),
  );

  return matchingIds.size === 1 ? [...matchingIds][0] : undefined;
}

export interface ManualSeriesScore {
  readonly team0: number;
  readonly team1: number;
}

export function parseManualSeriesGamesWon(raw: string): number | undefined {
  const trimmed = raw.trim();
  return /^\d{1,2}$/.test(trimmed) ? Number(trimmed) : undefined;
}

export function formatManualSeriesScore(score: ManualSeriesScore, locale: string, includeEmojis: boolean): string {
  const value = `${score.team0.toLocaleString(locale)}:${score.team1.toLocaleString(locale)}`;
  return includeEmojis ? `🦅 ${value} 🐍` : value;
}

export function getOutcomeForManualSeriesScore(score: ManualSeriesScore): "TEAM_0" | "TEAM_1" | "TIE" {
  if (score.team0 === score.team1) {
    return "TIE";
  }

  return score.team0 > score.team1 ? "TEAM_0" : "TEAM_1";
}
