import type { MatchStats } from "halo-infinite-api";
import { differenceInSeconds, isValid, parseISO } from "date-fns";
import type { DiscordSeriesStatsResolved } from "@guilty-spark/shared/contracts/stats/discord-series";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { HaloMedalMetadataResolver } from "../../services/halo/medal-metadata-resolver";
import type { MatchStatsData } from "../../controllers/stats/types";
import { isMatchStats } from "../../controllers/stats/is-match-stats";
import { StatsController } from "../../controllers/stats/stats-controller";
import { GAMES_SUFFIX_RE, KillMatrixFormatter } from "../../controllers/stats/kill-matrix/kill-matrix-formatter";
import {
  EMPTY_KILL_MATRIX_PIVOT_DATA,
  type KillMatrixPlayer,
  type KillMatrixViewRow,
} from "../../controllers/stats/kill-matrix/types";
import type { MatchAnalyticsService } from "../../services/stats/match-analytics-types";
import { ComponentLoaderStatus } from "../component-loader/component-loader";
import { DEFAULT_TEAM_COLORS, getTeamColorOrDefault, type TeamColor } from "../team-colors/team-colors";
import { gameModeIconSrc } from "../individual-tracker/game-mode-icon";
import type {
  SeriesMatchDetail as DiscordSeriesMatchDetail,
  SeriesMatchSummary as DiscordSeriesMatchSummary,
  SeriesStatsViewModel as DiscordSeriesStatsViewModel,
  SeriesTeamCard as DiscordSeriesTeamCard,
} from "../series-stats/types";
import { formatScoreProgression } from "../stats/score-progression/score-progression-formatter";
import type { DiscordSeriesStatsSnapshot, DiscordSeriesStatsStore } from "./discord-series-stats-store";

const WIN_OUTCOME = 2;

interface SeriesMetadata {
  readonly score: string;
  readonly duration: string;
  readonly startTime: string;
  readonly endTime: string;
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
    duration: `${String(totalMinutes)}m ${String(remainingSeconds).padStart(2, "0")}s`,
    startTime: firstMatch.startTime,
    endTime: lastMatch.endTime,
  };
}

export class DiscordSeriesStatsPresenter {
  private cancelled = false;

  constructor(
    readonly renderData: DiscordSeriesStatsResolved["renderData"],
    private readonly controller: StatsController,
    private readonly store: DiscordSeriesStatsStore,
    private readonly matchAnalyticsService: MatchAnalyticsService,
    private readonly medalMetadataResolver: HaloMedalMetadataResolver,
  ) {}

  start(): void {
    this.cancelled = false;
    this.store.update({ analyticsStatus: ComponentLoaderStatus.LOADING });
    void this.fetchMedalMetadata();
    void this.fetchAnalytics();
  }

  dispose(): void {
    this.cancelled = true;
  }

  private async fetchAnalytics(): Promise<void> {
    const matchIds = this.renderData.matches.map((m) => m.matchId);
    if (matchIds.length === 0) {
      this.store.update({ analyticsStatus: ComponentLoaderStatus.LOADED });
      return;
    }
    try {
      const batchResults = await this.matchAnalyticsService.getBatchMatchAnalytics(matchIds, [
        "killMatrix",
        "scoreProgression",
      ]);
      if (this.cancelled) {
        return;
      }
      const map = new Map<string, MatchAnalytics>();
      for (const [matchId, analytics] of Object.entries(batchResults)) {
        if (analytics != null) {
          map.set(matchId, analytics);
        }
      }
      this.store.update({ analyticsByMatchId: map, analyticsStatus: ComponentLoaderStatus.LOADED });
    } catch {
      if (this.cancelled) {
        return;
      }
      this.store.update({ analyticsStatus: ComponentLoaderStatus.ERROR });
    }
  }

  private async fetchMedalMetadata(): Promise<void> {
    const rawMatches = this.renderData.matches.map((m) => m.rawMatch).filter((m): m is MatchStats => isMatchStats(m));
    if (rawMatches.length === 0) {
      return;
    }

    const medalMetadata = await this.medalMetadataResolver.getMedalMetadataForMatches(rawMatches);
    if (this.cancelled) {
      return;
    }

    this.store.update({ medalMetadata });
  }

  present(snapshot: DiscordSeriesStatsSnapshot): DiscordSeriesStatsViewModel {
    const teamColors = [
      getTeamColorOrDefault(DEFAULT_TEAM_COLORS[0], 0),
      getTeamColorOrDefault(DEFAULT_TEAM_COLORS[1], 1),
    ];

    const rawMatches = this.renderData.matches.map((m) => m.rawMatch).filter((m): m is MatchStats => isMatchStats(m));

    let playersByXuid: ReadonlyMap<string, { gamertag: string; teamId: number | null }> = new Map(
      this.renderData.matches.flatMap((match) =>
        Object.entries(match.playerXuidToGametag).map(([xuid, gamertag]) => [
          xuid,
          { gamertag, teamId: null as number | null },
        ]),
      ),
    );
    let orderedPlayers: readonly KillMatrixPlayer[] | undefined = undefined;
    let seriesData: { teamData: MatchStatsData[]; playerData: MatchStatsData[] } | null = null;

    if (rawMatches.length > 0) {
      try {
        const playersMap = new Map<string, string>();
        for (const match of this.renderData.matches) {
          for (const [xuid, gamertag] of Object.entries(match.playerXuidToGametag)) {
            playersMap.set(xuid, gamertag);
          }
        }
        this.controller.loadSeries(rawMatches, playersMap, snapshot.medalMetadata);
        seriesData = this.controller.getSeriesStats();
        const players = this.controller.getPlayers();
        const playersByGamertag = new Map(players.map((p) => [p.gamertag, p]));
        const resolvedPlayers = seriesData.playerData
          .flatMap((teamData) =>
            teamData.players.map((p) => playersByGamertag.get(p.name.replace(GAMES_SUFFIX_RE, ""))),
          )
          .filter((p): p is KillMatrixPlayer => p != null);
        orderedPlayers = resolvedPlayers.length === players.length ? resolvedPlayers : players;
        playersByXuid = new Map(players.map((p) => [p.xuid, { gamertag: p.gamertag, teamId: p.teamId }]));
      } catch {
        seriesData = null;
      }
    }

    const killMatrixFormatter = new KillMatrixFormatter();
    const matchKillMatrixRows = new Map<string, readonly KillMatrixViewRow[]>();
    for (const match of this.renderData.matches) {
      const analytics = snapshot.analyticsByMatchId.get(match.matchId);
      if (analytics != null) {
        matchKillMatrixRows.set(match.matchId, killMatrixFormatter.present({ analytics, playersByXuid }));
      }
    }
    const matchSummaries: DiscordSeriesMatchSummary[] = this.renderData.matches.map((match) => ({
      matchId: match.matchId,
      gameMapThumbnailUrl: match.gameMapThumbnailUrl,
      gameModeIconUrl: gameModeIconSrc(match.gameVariantCategory),
      gameModeAlt: match.gameType,
      gameScore: match.gameScore,
      gameSubScore: match.gameSubScore ?? null,
      gameMap: match.gameMap,
      winningTeamColorHex: DiscordSeriesStatsPresenter.getWinningTeamColor(match.rawMatch, teamColors)?.hex ?? null,
    }));

    const teams: DiscordSeriesTeamCard[] = this.renderData.teams.map((team, teamIndex) => {
      const teamColor =
        teamIndex < 2
          ? (teamColors[teamIndex] ?? getTeamColorOrDefault(undefined, teamIndex))
          : getTeamColorOrDefault(undefined, teamIndex);
      return { name: team.name, players: team.players, teamColorHex: teamColor.hex };
    });

    const matchDetails: DiscordSeriesMatchDetail[] = this.renderData.matches.map((match, index) => {
      const rows = matchKillMatrixRows.get(match.matchId);
      const analytics = snapshot.analyticsByMatchId.get(match.matchId) ?? null;
      const crossTeam =
        rows != null && orderedPlayers != null ? KillMatrixFormatter.buildCrossTeam(rows, orderedPlayers) : null;
      const base = {
        matchId: match.matchId,
        gameMapThumbnailUrl: match.gameMapThumbnailUrl,
        gameModeIconUrl: gameModeIconSrc(match.gameVariantCategory),
        gameModeAlt: match.gameType,
        matchNumber: index + 1,
        gameTypeAndMap: match.gameTypeAndMap,
        duration: match.duration,
        score: match.gameSubScore != null ? `${match.gameScore} (${match.gameSubScore})` : match.gameScore,
        startTime: match.startTime,
        endTime: match.endTime,
        teamColors,
        killMatrixPivotData:
          rows != null ? KillMatrixFormatter.pivot(rows, orderedPlayers) : EMPTY_KILL_MATRIX_PIVOT_DATA,
        transposedKillMatrixPivotData:
          rows != null ? KillMatrixFormatter.transpose(rows, orderedPlayers) : EMPTY_KILL_MATRIX_PIVOT_DATA,
        crossTeamKillMatrixData: crossTeam?.crossTeamData ?? null,
        swappedCrossTeamKillMatrixData: crossTeam?.swappedCrossTeamData ?? null,
        killMatrixStatus: snapshot.analyticsStatus,
        scoreProgressionViewData: formatScoreProgression(
          analytics?.scoreProgression ?? null,
          teamColors,
          seriesData?.teamData[0]?.players.length ?? null,
        ),
      };
      if (!isMatchStats(match.rawMatch)) {
        return { ...base, data: null };
      }
      try {
        const matchController = new StatsController();
        const playerMap = new Map<string, string>(Object.entries(match.playerXuidToGametag));
        matchController.loadMatch(match.rawMatch, playerMap, snapshot.medalMetadata);
        return { ...base, data: matchController.getMatchStats() };
      } catch {
        return { ...base, data: null };
      }
    });

    const aggregatedKillMatrixRows = KillMatrixFormatter.aggregate(
      [...matchKillMatrixRows.values()].flatMap((rows) => rows),
    );
    const aggregatedCrossTeam =
      orderedPlayers != null ? KillMatrixFormatter.buildCrossTeam(aggregatedKillMatrixRows, orderedPlayers) : null;
    const seriesStats: DiscordSeriesStatsViewModel["seriesStats"] =
      seriesData != null
        ? {
            teamData: seriesData.teamData,
            playerData: seriesData.playerData,
            metadata: calculateSeriesMetadata(this.renderData.matches, this.renderData.seriesScore),
            teamColors,
            killMatrixPivotData: KillMatrixFormatter.pivot(aggregatedKillMatrixRows, orderedPlayers),
            transposedKillMatrixPivotData: KillMatrixFormatter.transpose(aggregatedKillMatrixRows, orderedPlayers),
            crossTeamKillMatrixData: aggregatedCrossTeam?.crossTeamData ?? null,
            swappedCrossTeamKillMatrixData: aggregatedCrossTeam?.swappedCrossTeamData ?? null,
            killMatrixStatus: snapshot.analyticsStatus,
          }
        : null;

    return {
      title: this.renderData.title,
      subtitle: this.renderData.subtitle,
      seriesScore: this.renderData.seriesScore,
      matchSummaries,
      teams,
      seriesStats,
      matchDetails,
    };
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
