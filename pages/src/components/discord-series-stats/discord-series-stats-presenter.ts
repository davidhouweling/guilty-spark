import type { MatchStats } from "halo-infinite-api";
import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";
import { createMatchStatsPresenter } from "../stats/create";
import { SeriesTeamStatsPresenter } from "../stats/series-team-stats-presenter";
import { SeriesPlayerStatsPresenter } from "../stats/series-player-stats-presenter";
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

  const startMs = new Date(firstMatch.startTime).getTime();
  const endMs = new Date(lastMatch.endTime).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null;
  }

  const totalMs = endMs - startMs;
  const totalMinutes = Math.floor(totalMs / 60000);
  const totalSeconds = Math.floor((totalMs % 60000) / 1000);

  return {
    score: seriesScore,
    duration: `${totalMinutes.toLocaleString()}m ${totalSeconds.toLocaleString()}s`,
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
        const presenter = createMatchStatsPresenter(match.rawMatch.MatchInfo.GameVariantCategory);
        const playerMap = new Map<string, string>(Object.entries(match.playerXuidToGametag));
        return { matchId: match.matchId, data: presenter.getData(match.rawMatch, playerMap) };
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
        const teamPresenter = new SeriesTeamStatsPresenter();
        const playerPresenter = new SeriesPlayerStatsPresenter();
        const playersMap = new Map<string, string>();

        for (const match of this.renderData.matches) {
          for (const [xuid, gamertag] of Object.entries(match.playerXuidToGametag)) {
            playersMap.set(xuid, gamertag);
          }
        }

        seriesStats = {
          teamData: teamPresenter.getSeriesData(rawMatches, playersMap),
          playerData: playerPresenter.getSeriesData(rawMatches, playersMap),
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
