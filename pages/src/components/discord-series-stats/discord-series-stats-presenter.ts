import type { MatchStats } from "halo-infinite-api";
import { differenceInSeconds, isValid, parseISO } from "date-fns";
import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";
import { createMatchStatsFormatter } from "../stats/create";
import { SeriesTeamStatsFormatter } from "../stats/series-team-stats-presenter";
import { SeriesPlayerStatsFormatter } from "../stats/series-player-stats-presenter";
import type { MatchStatsData } from "../stats/types";
import { DEFAULT_TEAM_COLORS, getTeamColorOrDefault, type TeamColor } from "../team-colors/team-colors";

const WIN_OUTCOME = 2;

interface SeriesMetadata {
  readonly score: string;
  readonly duration: string;
  readonly startTime: string;
  readonly endTime: string;
}

export interface DiscordSeriesStatsViewModel {
  readonly teamColors: readonly TeamColor[];
  readonly allMatchStats: { matchId: string; data: MatchStatsData[] | null }[];
  readonly seriesStats: {
    readonly teamData: MatchStatsData[];
    readonly playerData: MatchStatsData[];
    readonly metadata: SeriesMetadata | null;
  } | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null;
}

function isMatchStats(value: unknown): value is MatchStats {
  if (!isRecord(value)) {
    return false;
  }

  const matchInfo = value.MatchInfo;
  if (!isRecord(matchInfo)) {
    return false;
  }

  return (
    typeof value.MatchId === "string" &&
    Array.isArray(value.Teams) &&
    Array.isArray(value.Players) &&
    typeof matchInfo.StartTime === "string" &&
    typeof matchInfo.EndTime === "string"
  );
}

function calculateSeriesMetadata(
  matches: readonly { startTime: string; endTime: string }[],
  seriesScore: string,
): SeriesMetadata | null {
  if (matches.length === 0) {
    return null;
  }

  const [firstMatch] = matches;
  const lastMatch = matches[matches.length - 1];

  const startDate = parseISO(firstMatch.startTime);
  const endDate = parseISO(lastMatch.endTime);
  if (!isValid(startDate) || !isValid(endDate)) {
    return null;
  }

  const totalSeconds = differenceInSeconds(endDate, startDate);
  if (totalSeconds < 0) {
    return null;
  }

  const totalMinutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return {
    score: seriesScore,
    duration: `${totalMinutes.toString()}m ${remainingSeconds.toString().padStart(2, "0")}s`,
    startTime: firstMatch.startTime,
    endTime: lastMatch.endTime,
  };
}

export class DiscordSeriesStatsPresenter {
  constructor(readonly renderData: DiscordSeriesStatsResolved["renderData"]) {}

  private static readonly modelByRenderData = new WeakMap<
    DiscordSeriesStatsResolved["renderData"],
    DiscordSeriesStatsViewModel
  >();

  present(): DiscordSeriesStatsViewModel {
    const cached = DiscordSeriesStatsPresenter.modelByRenderData.get(this.renderData);
    if (cached != null) {
      return cached;
    }

    const allMatchStats = this.renderData.matches.map((match) => {
      if (!isMatchStats(match.rawMatch)) {
        return { matchId: match.matchId, data: null };
      }

      try {
        const formatter = createMatchStatsFormatter(match.rawMatch.MatchInfo.GameVariantCategory);
        const playerMap = new Map<string, string>(Object.entries(match.playerXuidToGametag));
        return {
          matchId: match.matchId,
          data: formatter.getData(match.rawMatch, playerMap, this.renderData.medalMetadata),
        };
      } catch {
        return { matchId: match.matchId, data: null };
      }
    });

    const rawMatches = this.renderData.matches
      .map((match) => match.rawMatch)
      .filter((match): match is MatchStats => isMatchStats(match));

    let seriesStats: DiscordSeriesStatsViewModel["seriesStats"] = null;
    const teamColors = [
      getTeamColorOrDefault(DEFAULT_TEAM_COLORS[0], 0),
      getTeamColorOrDefault(DEFAULT_TEAM_COLORS[1], 1),
    ];

    if (rawMatches.length > 0) {
      try {
        const teamFormatter = new SeriesTeamStatsFormatter();
        const playerFormatter = new SeriesPlayerStatsFormatter();
        const playersMap = new Map<string, string>();

        for (const match of this.renderData.matches) {
          for (const [xuid, gamertag] of Object.entries(match.playerXuidToGametag)) {
            playersMap.set(xuid, gamertag);
          }
        }

        seriesStats = {
          teamData: teamFormatter.getSeriesData(rawMatches, playersMap, this.renderData.medalMetadata),
          playerData: playerFormatter.getSeriesData(rawMatches, playersMap, this.renderData.medalMetadata),
          metadata: calculateSeriesMetadata(this.renderData.matches, this.renderData.seriesScore),
        };
      } catch {
        seriesStats = null;
      }
    }

    const model = {
      teamColors,
      allMatchStats,
      seriesStats,
    };
    DiscordSeriesStatsPresenter.modelByRenderData.set(this.renderData, model);
    return model;
  }

  static getWinningTeamColor(rawMatch: unknown, teamColors: readonly TeamColor[]): TeamColor | null {
    if (!isMatchStats(rawMatch)) {
      return null;
    }

    const winningTeamIndex = rawMatch.Teams.findIndex((team) => team.Outcome === WIN_OUTCOME);
    if (winningTeamIndex < 0) {
      return null;
    }

    return getTeamColorOrDefault(teamColors[winningTeamIndex]?.id, winningTeamIndex);
  }
}
