import type { MatchStats } from "halo-infinite-api";
import type { MedalMetadata } from "@guilty-spark/shared/halo/medals";
import { getPlayerXuid } from "@guilty-spark/shared/halo/match-stats";
import { getTeamName } from "@guilty-spark/shared/halo/team";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { isMatchStats } from "../../controllers/stats/is-match-stats";
import { calculateSeriesMetadata } from "../../controllers/stats/series-metadata";
import { StatsController } from "../../controllers/stats/stats-controller";
import { GAMES_SUFFIX_RE, KillMatrixFormatter } from "../../controllers/stats/kill-matrix/kill-matrix-formatter";
import { EMPTY_KILL_MATRIX_PIVOT_DATA } from "../../controllers/stats/kill-matrix/types";
import type { KillMatrixPlayer } from "../../controllers/stats/kill-matrix/types";
import type { ComponentLoaderStatus } from "../component-loader/component-loader";
import { getTeamColorOrDefault } from "../team-colors/team-colors";
import type { TeamColor } from "../team-colors/team-colors";
import { gameModeIconSrc } from "../individual-tracker/game-mode-icon";
import { formatScoreProgression } from "../stats/score-progression/score-progression-formatter";
import type {
  SeriesMatchDetail,
  SeriesMatchSummary,
  SeriesStatsSummary,
  SeriesStatsViewModel,
  SeriesTeamCard,
} from "./types";

const WIN_OUTCOME = 2;

export interface SeriesSummaryInput {
  readonly title: string;
  readonly subtitle: string;
  readonly score: string;
}

export interface ResolvedSeriesMatch {
  readonly matchId: string;
  readonly gameTypeAndMap: string;
  readonly gameVariantCategory: number;
  readonly gameType: string;
  readonly gameMap: string;
  readonly gameMapThumbnailUrl: string;
  readonly duration: string;
  readonly gameScore: string;
  readonly gameSubScore: string | null;
  readonly startTime: string;
  readonly endTime: string;
  readonly rawMatch: unknown;
}

export interface BuildSeriesViewModelArgs {
  readonly series: SeriesSummaryInput;
  readonly matches: readonly ResolvedSeriesMatch[];
  readonly rawMatches: readonly MatchStats[];
  readonly medalMetadata: MedalMetadata;
  readonly playerMap: Map<string, string>;
  readonly teamColors: readonly TeamColor[];
  readonly analyticsByMatchId: ReadonlyMap<string, MatchAnalytics>;
  readonly analyticsStatus: ComponentLoaderStatus;
}

function getLatestRawMatch(rawMatches: readonly MatchStats[]): MatchStats | undefined {
  let latest: MatchStats | undefined;
  let latestTime = Number.NEGATIVE_INFINITY;

  for (const match of rawMatches) {
    const endTime = new Date(match.MatchInfo.EndTime).getTime();
    if (!Number.isFinite(endTime)) {
      continue;
    }
    if (endTime > latestTime) {
      latest = match;
      latestTime = endTime;
    }
  }

  return latest;
}

export function buildSeriesViewModel({
  series,
  matches,
  rawMatches,
  medalMetadata,
  playerMap,
  teamColors,
  analyticsByMatchId,
  analyticsStatus,
}: BuildSeriesViewModelArgs): SeriesStatsViewModel {
  // --- Series totals ---
  const seriesController = new StatsController();
  seriesController.loadSeries([...rawMatches], playerMap, medalMetadata);
  const seriesTotals = seriesController.getSeriesStats();
  const seriesPlayers = seriesController.getPlayers();
  const playersByGamertag = new Map(seriesPlayers.map((player) => [player.gamertag, player]));
  const resolvedSeriesPlayers = seriesTotals.playerData
    .flatMap((teamData) =>
      teamData.players.map((player) => playersByGamertag.get(player.name.replace(GAMES_SUFFIX_RE, ""))),
    )
    .filter((player): player is KillMatrixPlayer => player != null);
  const orderedSeriesPlayers =
    resolvedSeriesPlayers.length === seriesPlayers.length ? resolvedSeriesPlayers : seriesPlayers;
  const playersByXuid = new Map(
    seriesPlayers.map((player) => [player.xuid, { gamertag: player.gamertag, teamId: player.teamId }]),
  );
  const killMatrixFormatter = new KillMatrixFormatter();

  const metadata = calculateSeriesMetadata(
    matches.map((m) => ({ startTime: m.startTime, endTime: m.endTime })),
    series.score,
  );

  const seriesStats: SeriesStatsSummary = {
    teamData: seriesTotals.teamData,
    playerData: seriesTotals.playerData,
    metadata,
    teamColors,
    killMatrixPivotData: EMPTY_KILL_MATRIX_PIVOT_DATA,
    transposedKillMatrixPivotData: EMPTY_KILL_MATRIX_PIVOT_DATA,
    crossTeamKillMatrixData: null,
    swappedCrossTeamKillMatrixData: null,
    killMatrixStatus: analyticsStatus,
  };

  // --- Match summaries (score cards) ---
  const matchSummaries: SeriesMatchSummary[] = matches.map((m) => {
    let winningTeamColorHex: string | null = null;
    if (isMatchStats(m.rawMatch)) {
      const winningTeamIndex = m.rawMatch.Teams.findIndex((t) => t.Outcome === WIN_OUTCOME);
      if (winningTeamIndex >= 0) {
        winningTeamColorHex = getTeamColorOrDefault(teamColors[winningTeamIndex]?.id, winningTeamIndex).hex;
      }
    }
    return {
      matchId: m.matchId,
      gameMapThumbnailUrl: m.gameMapThumbnailUrl,
      gameModeIconUrl: gameModeIconSrc(m.gameVariantCategory),
      gameModeAlt: m.gameType,
      gameScore: m.gameScore,
      gameSubScore: m.gameSubScore,
      gameMap: m.gameMap,
      winningTeamColorHex,
    };
  });

  // --- Team cards (derived from the latest chronological match's team/player layout) ---
  const lastRawMatch = getLatestRawMatch(rawMatches);
  const teams: SeriesTeamCard[] =
    lastRawMatch === undefined
      ? []
      : lastRawMatch.Teams.map((team, teamIndex) => ({
          name: getTeamName(team.TeamId),
          players: lastRawMatch.Players.filter(
            (p) =>
              p.PlayerType === 1 &&
              p.ParticipationInfo.PresentAtBeginning &&
              p.PlayerTeamStats.some((ts) => ts.TeamId === team.TeamId),
          ).map((p) => playerMap.get(getPlayerXuid(p)) ?? "*Unknown*"),
          teamColorHex: getTeamColorOrDefault(teamColors[teamIndex]?.id, teamIndex).hex,
        }));

  const matchKillMatrixRows = new Map<string, ReturnType<KillMatrixFormatter["present"]>>();

  // --- Per-match detail sections ---
  const matchDetails: SeriesMatchDetail[] = matches.map((m, index) => {
    const { rawMatch } = m;
    let data = null;
    let orderedPlayers: readonly KillMatrixPlayer[] | undefined = undefined;
    const analytics = analyticsByMatchId.get(m.matchId) ?? null;
    if (isMatchStats(rawMatch)) {
      try {
        const matchController = new StatsController();
        matchController.loadMatch(rawMatch, playerMap, medalMetadata);
        data = matchController.getMatchStats();

        const matchPlayers = matchController.getPlayers();
        const matchPlayersByGamertag = new Map(matchPlayers.map((player) => [player.gamertag, player]));
        const resolvedPlayers = data
          .flatMap((teamData) =>
            teamData.players.map((player) => matchPlayersByGamertag.get(player.name.replace(GAMES_SUFFIX_RE, ""))),
          )
          .filter((player): player is KillMatrixPlayer => player != null);
        orderedPlayers = resolvedPlayers.length === matchPlayers.length ? resolvedPlayers : matchPlayers;
      } catch {
        data = null;
      }
    }

    const killMatrixRows = analytics != null ? killMatrixFormatter.present({ analytics, playersByXuid }) : null;
    if (killMatrixRows != null) {
      matchKillMatrixRows.set(m.matchId, killMatrixRows);
    }
    const crossTeam =
      killMatrixRows != null
        ? KillMatrixFormatter.buildCrossTeam(killMatrixRows, orderedPlayers ?? orderedSeriesPlayers)
        : null;

    return {
      matchId: m.matchId,
      data,
      gameMapThumbnailUrl: m.gameMapThumbnailUrl,
      gameModeIconUrl: gameModeIconSrc(m.gameVariantCategory),
      gameModeAlt: m.gameType,
      matchNumber: index + 1,
      gameTypeAndMap: m.gameTypeAndMap,
      duration: m.duration,
      score: m.gameSubScore != null ? `${m.gameScore} (${m.gameSubScore})` : m.gameScore,
      startTime: m.startTime,
      endTime: m.endTime,
      teamColors,
      killMatrixPivotData:
        killMatrixRows != null
          ? KillMatrixFormatter.pivot(killMatrixRows, orderedPlayers ?? orderedSeriesPlayers)
          : EMPTY_KILL_MATRIX_PIVOT_DATA,
      transposedKillMatrixPivotData:
        killMatrixRows != null
          ? KillMatrixFormatter.transpose(killMatrixRows, orderedPlayers ?? orderedSeriesPlayers)
          : EMPTY_KILL_MATRIX_PIVOT_DATA,
      crossTeamKillMatrixData: crossTeam?.crossTeamData ?? null,
      swappedCrossTeamKillMatrixData: crossTeam?.swappedCrossTeamData ?? null,
      killMatrixStatus: analyticsStatus,
      scoreProgressionViewData: formatScoreProgression(
        analytics?.scoreProgression ?? null,
        teamColors,
        data?.[0]?.players.length ?? null,
      ),
    };
  });

  const aggregatedKillMatrixRows = KillMatrixFormatter.aggregate(
    [...matchKillMatrixRows.values()].flatMap((rows) => rows),
  );
  const hasAggregatedKillMatrix = matchKillMatrixRows.size > 0;
  const aggregatedCrossTeam = hasAggregatedKillMatrix
    ? KillMatrixFormatter.buildCrossTeam(aggregatedKillMatrixRows, orderedSeriesPlayers)
    : null;

  const seriesStatsWithAnalytics: SeriesStatsSummary = {
    ...seriesStats,
    killMatrixPivotData: hasAggregatedKillMatrix
      ? KillMatrixFormatter.pivot(aggregatedKillMatrixRows, orderedSeriesPlayers)
      : EMPTY_KILL_MATRIX_PIVOT_DATA,
    transposedKillMatrixPivotData: hasAggregatedKillMatrix
      ? KillMatrixFormatter.transpose(aggregatedKillMatrixRows, orderedSeriesPlayers)
      : EMPTY_KILL_MATRIX_PIVOT_DATA,
    crossTeamKillMatrixData: aggregatedCrossTeam?.crossTeamData ?? null,
    swappedCrossTeamKillMatrixData: aggregatedCrossTeam?.swappedCrossTeamData ?? null,
  };

  return {
    title: series.title,
    subtitle: series.subtitle,
    seriesScore: series.score,
    matchSummaries,
    teams,
    seriesStats: seriesStatsWithAnalytics,
    matchDetails,
  };
}
