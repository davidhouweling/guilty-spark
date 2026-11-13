import { differenceInSeconds } from "date-fns";
import type {
  MatchDetail,
  MatchDetailResult,
  SeriesAggregation,
  SeriesDetailResponse,
} from "@guilty-spark/shared/contracts/stats/detail";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { getDurationInIsoString, getReadableDuration } from "@guilty-spark/shared/halo/duration";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import { ComponentLoaderStatus } from "../component-loader/component-loader";
import type { StatsDetailController } from "../../controllers/stats/stats-detail-controller";
import { EMPTY_KILL_MATRIX_PIVOT_DATA } from "../../controllers/stats/kill-matrix/types";
import { KillMatrixFormatter } from "../../controllers/stats/kill-matrix/kill-matrix-formatter";
import type { KillMatrixPlayer } from "../../controllers/stats/kill-matrix/types";
import { getTeamColorOrDefault } from "../team-colors/team-colors";
import type { TeamColor } from "../team-colors/team-colors";
import { gameModeIconSrc } from "../individual-tracker/game-mode-icon";
import type {
  SeriesMatchDetail,
  SeriesMatchAnalyticsById,
  SeriesMatchAnalyticsState,
  SeriesMatchSummary,
  SeriesStatsPresentationOptions,
  SeriesStatsSummary,
  SeriesStatsViewModel,
  SeriesTeamCard,
} from "./types";

type ResolvedAggregation = Extract<SeriesAggregation, { status: "resolved" }>;
type ResolvedMatchResult = Extract<MatchDetailResult, { status: "resolved" }>;

const MAP_FALLBACK = "Unknown map";
const MODE_FALLBACK = "Unknown game mode";
const THUMBNAIL_FALLBACK = "data:,";
const UNAVAILABLE_SCORE = "Unavailable";
const EMPTY_ANALYTICS = {
  killMatrixPivotData: EMPTY_KILL_MATRIX_PIVOT_DATA,
  transposedKillMatrixPivotData: EMPTY_KILL_MATRIX_PIVOT_DATA,
  crossTeamKillMatrixData: null,
  swappedCrossTeamKillMatrixData: null,
  killMatrixStatus: ComponentLoaderStatus.PENDING,
  scoreProgressionStatus: ComponentLoaderStatus.PENDING,
  scoreProgressionViewData: null,
};
const AGGREGATION_WARNINGS: Record<Extract<SeriesAggregation, { status: "unavailable" }>["reason"], string> = {
  "incomplete-matches": "Series totals are unavailable because some match details could not be resolved.",
  "ambiguous-team-mapping": "Series totals are unavailable because team identities could not be matched reliably.",
  "aggregation-failed": "Series totals could not be calculated.",
};

export class SeriesDetailStatsViewModelPresenter {
  private readonly killMatrixFormatter = new KillMatrixFormatter();

  constructor(
    private readonly statsDetailController: StatsDetailController,
    private readonly locale?: string,
  ) {}

  present(
    response: SeriesDetailResponse,
    analyticsByMatchId: SeriesMatchAnalyticsById = new Map(),
    { teamColors = [] }: SeriesStatsPresentationOptions = {},
  ): SeriesStatsViewModel {
    const resolvedMatches = response.matches.results.filter(
      (result): result is ResolvedMatchResult => result.status === "resolved",
    );
    const aggregation = response.aggregation.status === "resolved" ? response.aggregation : null;
    const seriesScore = aggregation == null ? UNAVAILABLE_SCORE : this.formatSeriesScore(aggregation);
    const seriesStatsWarning =
      response.aggregation.status === "unavailable" ? AGGREGATION_WARNINGS[response.aggregation.reason] : null;
    const matchDetails = response.matches.results.map((result, index) =>
      this.presentMatch(result, index, analyticsByMatchId.get(result.matchId), teamColors),
    );
    const summaryDetails = response.matches.results.map((result) =>
      result.status === "resolved" ? result.detail : null,
    );
    const metadata = this.presentMetadata(summaryDetails, seriesScore);

    return {
      title: this.presentLabel(response.context?.title, "Series stats"),
      subtitle: this.presentLabel(response.context?.subtitle, "Series details unavailable"),
      seriesScore,
      matchSummaries: response.matches.results.map((result) => this.presentMatchSummary(result, teamColors)),
      teams: this.presentTeams(resolvedMatches, aggregation, teamColors),
      seriesStats:
        aggregation == null
          ? null
          : this.presentSeriesStats(
              aggregation,
              metadata,
              response.matches.matchIds,
              analyticsByMatchId,
              this.getLatestMatch(resolvedMatches),
              teamColors,
            ),
      seriesStatsWarning,
      matchDetails,
    };
  }

  private presentMatch(
    result: MatchDetailResult,
    index: number,
    analyticsState: SeriesMatchAnalyticsState | undefined,
    colorOverrides: readonly TeamColor[],
  ): SeriesMatchDetail {
    if (result.status === "unavailable") {
      return this.presentUnavailableMatch(result, index);
    }

    const { detail } = result;
    const labels = this.presentMatchLabels(detail);
    const data = this.statsDetailController.mapMatchDetailToStats(detail);
    const teamColors = this.presentMatchTeamColors(detail, colorOverrides);
    return {
      matchId: result.matchId,
      data,
      gameMapThumbnailUrl: detail.map.thumbnailUrl ?? THUMBNAIL_FALLBACK,
      gameModeIconUrl: gameModeIconSrc(detail.mode.gameVariantCategory),
      gameModeAlt: labels.gameMode,
      matchNumber: index + 1,
      gameTypeAndMap: `${labels.gameMode}: ${labels.gameMap}`,
      duration: this.formatDuration(detail.durationSeconds),
      score: this.presentMatchScore(detail),
      startTime: detail.startTime,
      endTime: detail.endTime,
      teamColors,
      ...this.statsDetailController.mapMatchDetailToAnalytics(detail, {
        killMatrix: analyticsState?.killMatrix?.data ?? null,
        scoreProgression: analyticsState?.scoreProgression?.data ?? null,
        teamColors,
        teamSize: data[0]?.players.length ?? null,
      }),
      killMatrixStatus: analyticsState?.killMatrix?.status ?? ComponentLoaderStatus.PENDING,
      scoreProgressionStatus: analyticsState?.scoreProgression?.status ?? ComponentLoaderStatus.PENDING,
    };
  }

  private presentUnavailableMatch(
    result: Extract<MatchDetailResult, { status: "unavailable" }>,
    index: number,
  ): SeriesMatchDetail {
    return {
      matchId: result.matchId,
      data: null,
      gameMapThumbnailUrl: THUMBNAIL_FALLBACK,
      gameModeIconUrl: gameModeIconSrc(-1),
      gameModeAlt: MODE_FALLBACK,
      matchNumber: index + 1,
      gameTypeAndMap: `${MODE_FALLBACK}: ${MAP_FALLBACK}`,
      duration: UNAVAILABLE_SCORE,
      score: UNAVAILABLE_SCORE,
      startTime: "",
      endTime: "",
      teamColors: [],
      ...EMPTY_ANALYTICS,
    };
  }

  private presentMatchSummary(result: MatchDetailResult, colorOverrides: readonly TeamColor[]): SeriesMatchSummary {
    if (result.status === "unavailable") {
      return {
        matchId: result.matchId,
        gameMapThumbnailUrl: THUMBNAIL_FALLBACK,
        gameModeIconUrl: gameModeIconSrc(-1),
        gameModeAlt: MODE_FALLBACK,
        gameScore: UNAVAILABLE_SCORE,
        gameSubScore: null,
        gameMap: MAP_FALLBACK,
        winningTeamColorHex: null,
      };
    }

    const { detail } = result;
    const labels = this.presentMatchLabels(detail);
    const scores = this.presentMatchScores(detail);
    const winner = detail.teams.find((team) => team.outcome === "Win");
    const teamColors = this.presentMatchTeamColors(detail, colorOverrides);
    const winnerColor = winner == null ? null : teamColors[winner.matchTeamId];

    return {
      matchId: result.matchId,
      gameMapThumbnailUrl: detail.map.thumbnailUrl ?? THUMBNAIL_FALLBACK,
      gameModeIconUrl: gameModeIconSrc(detail.mode.gameVariantCategory),
      gameModeAlt: labels.gameMode,
      gameScore: scores.primary ?? UNAVAILABLE_SCORE,
      gameSubScore: scores.secondary,
      gameMap: labels.gameMap,
      winningTeamColorHex: winnerColor?.hex ?? null,
    };
  }

  private presentMatchLabels(detail: MatchDetail): {
    gameMode: string;
    gameMap: string;
  } {
    return {
      gameMode: this.presentLabel(detail.mode.name, MODE_FALLBACK),
      gameMap: this.presentLabel(detail.map.name, MAP_FALLBACK),
    };
  }

  private presentMatchScore(detail: MatchDetail): string {
    const { primary, secondary } = this.presentMatchScores(detail);
    if (primary == null) {
      return UNAVAILABLE_SCORE;
    }
    return secondary == null ? primary : `${primary} (${secondary})`;
  }

  private presentMatchScores(detail: MatchDetail): { primary: string | null; secondary: string | null } {
    return {
      primary: this.presentScoreSection(detail.score.primary),
      secondary: this.presentScoreSection(detail.score.secondary),
    };
  }

  private presentScoreSection(section: MatchDetail["score"]["primary"]): string | null {
    if (section == null || section.teams.length === 0) {
      return null;
    }

    return [...section.teams]
      .sort((left, right) => {
        const leftId = left.seriesTeamId ?? left.matchTeamId;
        const rightId = right.seriesTeamId ?? right.matchTeamId;
        return leftId - rightId;
      })
      .map(({ value }) => value.toLocaleString(this.locale))
      .join(":");
  }

  private presentMatchTeamColors(detail: MatchDetail, colorOverrides: readonly TeamColor[]): TeamColor[] {
    const teamColors: TeamColor[] = [];
    const teams = [...detail.teams].sort((left, right) => this.getStableTeamId(left) - this.getStableTeamId(right));
    for (const [index, team] of teams.entries()) {
      teamColors[team.matchTeamId] = this.presentTeamColor(index, colorOverrides);
    }
    return teamColors;
  }

  private presentTeamColor(teamIndex: number, colorOverrides: readonly TeamColor[]): TeamColor {
    return colorOverrides[teamIndex] ?? getTeamColorOrDefault(undefined, teamIndex);
  }

  private presentTeams(
    resolvedResults: readonly ResolvedMatchResult[],
    aggregation: ResolvedAggregation | null,
    colorOverrides: readonly TeamColor[],
  ): SeriesTeamCard[] {
    const latestMatch = this.getLatestMatch(resolvedResults);
    if (latestMatch == null) {
      return [];
    }

    const playersById = new Map(latestMatch.players.map((player) => [player.playerId, player]));
    const aggregationTeams = new Map(aggregation?.teams.map((team) => [team.seriesTeamId, team]) ?? []);
    const aggregationPlayers = new Map(aggregation?.players.map((player) => [player.playerId, player]) ?? []);

    const teams = [...latestMatch.teams].sort(
      (left, right) => this.getStableTeamId(left) - this.getStableTeamId(right),
    );
    return teams.map((team, index) => {
      const stableTeamId = this.getStableTeamId(team);
      const seriesTeam = team.seriesTeamId == null ? undefined : aggregationTeams.get(team.seriesTeamId);
      const players = team.playerIds.flatMap((playerId) => {
        const player = playersById.get(playerId);
        const participatesOnTeam = player?.teamStats.some((stats) => stats.matchTeamId === team.matchTeamId) ?? false;
        if (player == null || !player.participation.presentAtBeginning || !participatesOnTeam) {
          return [];
        }
        if (player.playerType !== 1) {
          return ["Bot"];
        }
        const label = aggregationPlayers.get(playerId)?.gamertag ?? player.gamertag ?? "*Unknown*";
        return [label];
      });

      return {
        name: this.presentLabel(seriesTeam?.name, this.presentLabel(team.name, getTeamName(stableTeamId))),
        players,
        teamColorHex: this.presentTeamColor(index, colorOverrides).hex,
      };
    });
  }

  private getLatestMatch(results: readonly ResolvedMatchResult[]): MatchDetail | null {
    let latest: MatchDetail | null = null;
    for (const result of results) {
      if (latest == null || Date.parse(result.detail.endTime) > Date.parse(latest.endTime)) {
        latest = result.detail;
      }
    }
    return latest;
  }

  private getStableTeamId(team: { readonly seriesTeamId: number | null; readonly matchTeamId: number }): number {
    return team.seriesTeamId ?? team.matchTeamId;
  }

  private formatSeriesScore(aggregation: ResolvedAggregation): string {
    const teams = [...aggregation.teams].sort((left, right) => left.seriesTeamId - right.seriesTeamId);
    const first = teams[0]?.gamesWon ?? 0;
    const second = teams[1]?.gamesWon ?? 0;
    return `${first.toLocaleString(this.locale)}:${second.toLocaleString(this.locale)}`;
  }

  private presentMetadata(details: readonly (MatchDetail | null)[], score: string): SeriesStatsSummary["metadata"] {
    const matches = details.filter((detail): detail is MatchDetail => detail != null);
    if (matches.length === 0) {
      return null;
    }
    const [first] = [...matches].sort((left, right) => Date.parse(left.startTime) - Date.parse(right.startTime));
    const [last] = [...matches].sort((left, right) => Date.parse(right.endTime) - Date.parse(left.endTime));
    const durationSeconds = Math.max(0, differenceInSeconds(new Date(last.endTime), new Date(first.startTime)));
    return {
      score,
      duration: getReadableDuration(getDurationInIsoString(durationSeconds), this.locale),
      startTime: first.startTime,
      endTime: last.endTime,
    };
  }

  private presentSeriesStats(
    aggregation: ResolvedAggregation,
    metadata: SeriesStatsSummary["metadata"],
    matchIds: readonly string[],
    analyticsByMatchId: SeriesMatchAnalyticsById,
    latestMatch: MatchDetail | null,
    colorOverrides: readonly TeamColor[],
  ): SeriesStatsSummary {
    const data = this.statsDetailController.mapSeriesAggregationToStats(aggregation);
    const teamColors: TeamColor[] = [];
    const teams = [...aggregation.teams].sort((left, right) => left.seriesTeamId - right.seriesTeamId);
    for (const [index, team] of teams.entries()) {
      teamColors[team.seriesTeamId] = this.presentTeamColor(index, colorOverrides);
    }
    const historicalPlayers = this.getSeriesKillMatrixPlayers(aggregation);
    const hasTeamChanges = historicalPlayers.some((player) => player.teamId == null);
    const seriesPlayers = this.presentSeriesKillMatrixPlayers(historicalPlayers, latestMatch);
    const playersByXuid = new Map(seriesPlayers.map((player) => [player.xuid, player]));
    const matchKillMatrixRows: ReturnType<KillMatrixFormatter["present"]> = [];
    let hasKillMatrixData = false;
    for (const matchId of new Set(matchIds)) {
      const killMatrix = analyticsByMatchId.get(matchId)?.killMatrix?.data;
      if (killMatrix == null) {
        continue;
      }
      hasKillMatrixData = true;
      matchKillMatrixRows.push(
        ...this.killMatrixFormatter.present({
          analytics: this.createKillMatrixAnalytics(killMatrix),
          playersByXuid,
        }),
      );
    }
    const aggregatedRows = KillMatrixFormatter.aggregate(matchKillMatrixRows);
    const crossTeam =
      hasKillMatrixData && !hasTeamChanges ? KillMatrixFormatter.buildCrossTeam(aggregatedRows, seriesPlayers) : null;
    return {
      teamData: data.teamData,
      playerData: data.playerData,
      metadata,
      teamColors,
      killMatrixPivotData: KillMatrixFormatter.pivot(aggregatedRows, seriesPlayers),
      transposedKillMatrixPivotData: KillMatrixFormatter.transpose(aggregatedRows, seriesPlayers),
      crossTeamKillMatrixData: crossTeam?.crossTeamData ?? null,
      swappedCrossTeamKillMatrixData: crossTeam?.swappedCrossTeamData ?? null,
      killMatrixStatus: this.getSeriesKillMatrixStatus(matchIds, analyticsByMatchId),
      scoreProgressionStatus: ComponentLoaderStatus.PENDING,
    };
  }

  private getSeriesKillMatrixPlayers(aggregation: ResolvedAggregation): KillMatrixPlayer[] {
    const playersById = new Map(aggregation.players.map((player) => [player.playerId, player]));
    const playersByXuid = new Map<string, KillMatrixPlayer>();
    const teams = [...aggregation.teams].sort((left, right) => left.seriesTeamId - right.seriesTeamId);
    for (const team of teams) {
      for (const playerId of team.playerIds) {
        const player = playersById.get(playerId);
        if (player?.xuid == null) {
          continue;
        }
        const existing = playersByXuid.get(player.xuid);
        if (existing == null) {
          playersByXuid.set(player.xuid, {
            xuid: player.xuid,
            gamertag: player.gamertag ?? "*Unknown*",
            teamId: team.seriesTeamId,
          });
        } else if (existing.teamId !== team.seriesTeamId && existing.teamId != null) {
          playersByXuid.set(player.xuid, { ...existing, teamId: null });
        }
      }
    }
    return [...playersByXuid.values()];
  }

  private presentSeriesKillMatrixPlayers(
    players: readonly KillMatrixPlayer[],
    latestMatch: MatchDetail | null,
  ): KillMatrixPlayer[] {
    const latestPlayers = new Map(latestMatch?.players.map((player) => [player.xuid, player]) ?? []);
    const teams = new Map(latestMatch?.teams.map((team) => [team.matchTeamId, team.seriesTeamId]) ?? []);
    return players
      .map((player) => {
        const latestPlayer = latestPlayers.get(player.xuid);
        const teamId = latestPlayer?.lastMatchTeamId;
        return latestPlayer == null
          ? player
          : { ...player, teamId: teamId == null ? null : (teams.get(teamId) ?? null) };
      })
      .sort((left, right) => (left.teamId ?? Infinity) - (right.teamId ?? Infinity));
  }

  private getSeriesKillMatrixStatus(
    matchIds: readonly string[],
    analyticsByMatchId: SeriesMatchAnalyticsById,
  ): ComponentLoaderStatus {
    const statuses = matchIds.map(
      (matchId) => analyticsByMatchId.get(matchId)?.killMatrix?.status ?? ComponentLoaderStatus.PENDING,
    );
    if (statuses.some((status) => status === ComponentLoaderStatus.ERROR)) {
      return ComponentLoaderStatus.ERROR;
    }
    if (statuses.every((status) => status === ComponentLoaderStatus.LOADED)) {
      return ComponentLoaderStatus.LOADED;
    }
    if (
      statuses.some((status) => status === ComponentLoaderStatus.LOADING || status === ComponentLoaderStatus.LOADED)
    ) {
      return ComponentLoaderStatus.LOADING;
    }
    return ComponentLoaderStatus.PENDING;
  }

  private createKillMatrixAnalytics(killMatrix: MatchAnalytics["killMatrix"]): MatchAnalytics {
    return { requestedModules: ["killMatrix"], killMatrix, scoreProgression: null };
  }

  private formatDuration(durationSeconds: number): string {
    return getReadableDuration(getDurationInIsoString(Math.floor(durationSeconds)), this.locale);
  }

  private presentLabel(value: string | null | undefined, fallback: string): string {
    const label = value?.trim();
    return label != null && label.length > 0 ? label : fallback;
  }
}
