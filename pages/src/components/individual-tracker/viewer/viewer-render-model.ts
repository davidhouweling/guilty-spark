import type {
  TrackerMatchSummary,
  TrackerSeriesGroup,
  TrackerViewState,
} from "@guilty-spark/shared/contracts/individual-tracker/view";
import { getGameModeName } from "@guilty-spark/shared/halo/game-variants";
import { getDurationInIsoString, getReadableDuration } from "@guilty-spark/shared/halo/duration";
import { normalizeOutcomeString, getOutcomeColor } from "@guilty-spark/shared/halo/match-enrichment";
import { differenceInSeconds, isValid, parseISO } from "date-fns";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type {
  ViewerActiveSeriesContext,
  IndividualTrackerViewerRenderModel,
  ViewerAccumulatedStats,
  ViewerMatchTab,
  ViewerPreSeriesTableData,
  ViewerSeriesTeamPlayer,
  ViewerSeriesTeam,
  ViewerSeriesTab,
  ViewerTimelineItem,
} from "./types";

export interface BuildViewerRenderModelOptions {
  readonly view: TrackerViewState;
  readonly preferredTeamColorId?: string;
  readonly preferredEnemyColorId?: string;
}

const UNKNOWN_KDA_DISPLAY = "-:-:- (-)";
const UNKNOWN_DAMAGE_RATIO_DISPLAY = "-:- (-)";
const PENDING_ACTIVE_SERIES_ID_PREFIX = "pending-active-series";
const PENDING_SERIES_SUMMARY_DISPLAY = "N/A";

type ActiveSeriesContext = NonNullable<TrackerViewState["activeSeriesContext"]>;
type ActiveSeriesTeam = ActiveSeriesContext["teams"][number];
type ActiveSeriesPlayer = ActiveSeriesTeam["players"][number];

function toViewerSeriesTeamPlayer(player: ActiveSeriesPlayer): ViewerSeriesTeamPlayer {
  return {
    discordId: player.discordId,
    discordName: player.discordName,
    gamertag: player.gamertag,
    xboxId: player.xboxId,
    currentRank: player.currentRank,
    currentRankTier: player.currentRankTier,
    currentRankSubTier: player.currentRankSubTier,
    currentRankMeasurementMatchesRemaining: player.currentRankMeasurementMatchesRemaining,
    currentRankInitialMeasurementMatches: player.currentRankInitialMeasurementMatches,
    allTimePeakRank: player.allTimePeakRank,
    esra: player.esra,
    lastRankedGamePlayed: player.lastRankedGamePlayed,
  };
}

function toViewerSeriesTeam(team: ActiveSeriesTeam): ViewerSeriesTeam {
  return {
    id: team.id,
    name: team.name,
    players: team.players.map(toViewerSeriesTeamPlayer),
  };
}

function findActiveSeriesId(view: TrackerViewState): string | null {
  if (!view.hasActiveSeries || view.activeSeriesContext == null) {
    return null;
  }

  const activeTitle = view.activeSeriesContext.title;
  const activeSubtitle = view.activeSeriesContext.subtitle ?? "";

  for (const series of view.series) {
    if (series.title === activeTitle && series.subtitle === activeSubtitle) {
      return series.id;
    }
  }

  const titleMatches = view.series.filter((series) => series.title === activeTitle);
  if (titleMatches.length === 1) {
    return titleMatches[0]?.id ?? null;
  }

  return null;
}

function getSeriesTeams(
  view: TrackerViewState,
  series: TrackerSeriesGroup,
  activeSeriesId: string | null,
): readonly ViewerSeriesTeam[] {
  if (view.activeSeriesContext == null || activeSeriesId == null || series.id !== activeSeriesId) {
    return [];
  }

  return view.activeSeriesContext.teams.map(toViewerSeriesTeam);
}

function toViewerActiveSeriesContext(view: TrackerViewState): ViewerActiveSeriesContext | undefined {
  if (view.activeSeriesContext == null) {
    return undefined;
  }

  return {
    title: view.activeSeriesContext.title,
    subtitle: view.activeSeriesContext.subtitle,
    guildIconUrl: view.activeSeriesContext.guildIconUrl ?? null,
    startedAt: view.activeSeriesContext.startedAt,
    teams: view.activeSeriesContext.teams.map(toViewerSeriesTeam),
  };
}

function toSeriesPlayerKey(
  teamId: number,
  player: {
    readonly discordId?: string | null;
    readonly xboxId?: string | null;
    readonly gamertag: string | null;
    readonly discordName: string | null;
  },
  playerIndex: number,
): string {
  const stableId = player.discordId ?? player.xboxId ?? player.gamertag ?? player.discordName;
  if (stableId != null && stableId !== "") {
    return `${teamId.toString()}:${stableId}`;
  }

  return `${teamId.toString()}:${playerIndex.toString()}`;
}

function toPreSeriesTableData(teams: readonly ViewerSeriesTeam[]): ViewerPreSeriesTableData {
  const playersAssociationData: ViewerPreSeriesTableData["playersAssociationData"] = {};
  const tableTeams = teams.map((team) => ({
    name: team.name,
    players: team.players.map((player, playerIndex) => {
      const playerId = toSeriesPlayerKey(team.id, player, playerIndex);
      const resolvedDiscordName = player.discordName ?? player.gamertag ?? "Unknown";

      playersAssociationData[playerId] = {
        discordId: player.discordId ?? playerId,
        discordName: resolvedDiscordName,
        xboxId: player.xboxId ?? null,
        gamertag: player.gamertag,
        currentRank: player.currentRank ?? null,
        currentRankTier: player.currentRankTier ?? null,
        currentRankSubTier: player.currentRankSubTier ?? null,
        currentRankMeasurementMatchesRemaining: player.currentRankMeasurementMatchesRemaining ?? null,
        currentRankInitialMeasurementMatches: player.currentRankInitialMeasurementMatches ?? null,
        allTimePeakRank: player.allTimePeakRank ?? null,
        esra: player.esra ?? null,
        lastRankedGamePlayed: player.lastRankedGamePlayed ?? null,
      };

      return {
        id: playerId,
        displayName: resolvedDiscordName,
      };
    }),
  }));

  return {
    teams: tableTeams,
    playersAssociationData,
  };
}

function toPendingActiveSeriesTab(view: TrackerViewState): ViewerSeriesTab {
  const { activeSeriesContext } = view;
  if (activeSeriesContext == null) {
    throw new Error("Expected active series context when building pending active series tab");
  }

  const activeSubtitle = activeSeriesContext.subtitle ?? "";
  const teams = activeSeriesContext.teams.map(toViewerSeriesTeam);

  return {
    id: `${PENDING_ACTIVE_SERIES_ID_PREFIX}:${activeSeriesContext.title}:${activeSubtitle}`,
    title: activeSeriesContext.title,
    subtitle: activeSubtitle,
    guildIconUrl: activeSeriesContext.guildIconUrl ?? null,
    isActive: true,
    teams,
    preSeriesTableData: toPreSeriesTableData(teams),
    matchBackgroundUrls: [],
    score: "0:0",
    duration: "-",
    killsDeathsAssistsKda: PENDING_SERIES_SUMMARY_DISPLAY,
    damageDealtTakenRatio: PENDING_SERIES_SUMMARY_DISPLAY,
    startTime: activeSeriesContext.startedAt ?? view.lastUpdateTime,
    endTime: "",
    matches: [],
    colorHex: undefined,
  };
}

function toReadableDurationOrUnknown(startTime: string, endTime: string): string {
  const startDate = parseISO(startTime);
  const endDate = parseISO(endTime);
  if (!isValid(startDate) || !isValid(endDate)) {
    return "unknown";
  }

  const durationInSeconds = differenceInSeconds(endDate, startDate);
  if (durationInSeconds < 0) {
    return "unknown";
  }

  const isoDuration = getDurationInIsoString(durationInSeconds);
  return getReadableDuration(isoDuration);
}

function toMatchTab(summary: TrackerMatchSummary, teamHex: string, enemyHex: string): ViewerMatchTab {
  const outcome = normalizeOutcomeString(summary.outcome);
  const duration = toReadableDurationOrUnknown(summary.startTime, summary.endTime);

  return {
    matchId: summary.matchId,
    mapName: summary.mapName,
    mapBackgroundUrl: summary.mapBackgroundUrl ?? "data:,",
    gameVariantCategory: summary.gameVariantCategory,
    isMatchmaking: summary.isMatchmaking,
    gameModeName: getGameModeName(summary.gameVariantCategory),
    duration,
    outcome,
    score: summary.score,
    killsDeathsAssistsKda: summary.killsDeathsAssistsKda,
    damageDealtTakenRatio: summary.damageDealtTakenRatio,
    colorHex: getOutcomeColor(outcome, teamHex, enemyHex),
    startTime: summary.startTime,
    endTime: summary.endTime,
  };
}

function accumulate(matches: readonly TrackerMatchSummary[]): ViewerAccumulatedStats {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const match of matches) {
    const outcome = normalizeOutcomeString(match.outcome);
    switch (outcome) {
      case "Win": {
        wins += 1;
        break;
      }
      case "Loss": {
        losses += 1;
        break;
      }
      case "Tie": {
        ties += 1;
        break;
      }
      case "DNF":
      case "Unknown": {
        break;
      }
      default: {
        throw new UnreachableError(outcome);
      }
    }
  }

  return {
    total: matches.length,
    wins,
    losses,
    ties,
  };
}

export function buildViewerRenderModel(options: BuildViewerRenderModelOptions): IndividualTrackerViewerRenderModel {
  const { view, preferredTeamColorId, preferredEnemyColorId } = options;

  const teamHex = getTeamColorOrDefault(preferredTeamColorId, 0).hex;
  const enemyHex = getTeamColorOrDefault(preferredEnemyColorId, 1).hex;

  const matchesById = new Map<string, TrackerMatchSummary>();
  for (const match of view.matches) {
    matchesById.set(match.matchId, match);
  }

  const seriesByAnchor = new Map<string, TrackerSeriesGroup>();
  const seriesMemberIds = new Set<string>();
  const activeSeriesId = findActiveSeriesId(view);
  let fallbackActiveSeriesId: string | null = null;
  for (const series of view.series) {
    const knownIds = series.matchIds.filter((id) => matchesById.has(id));
    const isCurrentActiveSeries = activeSeriesId != null && series.id === activeSeriesId;
    if (knownIds.length < 2 && !(isCurrentActiveSeries && knownIds.length > 0)) {
      continue;
    }
    const [anchorId] = series.matchIds;
    seriesByAnchor.set(anchorId, series);
    for (const id of series.matchIds) {
      seriesMemberIds.add(id);
    }
  }

  const timeline: ViewerTimelineItem[] = [];
  for (const match of view.matches) {
    const anchoredSeries = seriesByAnchor.get(match.matchId);
    if (anchoredSeries !== undefined) {
      const seriesMatches: ViewerMatchTab[] = [];
      const seriesSummaries: TrackerMatchSummary[] = [];
      for (const id of anchoredSeries.matchIds) {
        const member = matchesById.get(id);
        if (member !== undefined) {
          seriesMatches.push(toMatchTab(member, teamHex, enemyHex));
          seriesSummaries.push(member);
        }
      }

      let seriesDuration = "-";
      let seriesStartTime = "";
      let seriesEndTime = "";
      const isCurrentActiveSeries = activeSeriesId != null && anchoredSeries.id === activeSeriesId;

      if (seriesSummaries.length > 0) {
        seriesDuration = "unknown";
        let totalSeconds = 0;
        let hasInvalidDurationBounds = false;
        for (const summary of seriesSummaries) {
          const startDate = parseISO(summary.startTime);
          const endDate = parseISO(summary.endTime);
          if (!isValid(startDate) || !isValid(endDate)) {
            hasInvalidDurationBounds = true;
            break;
          }

          const durationInSeconds = differenceInSeconds(endDate, startDate);
          if (durationInSeconds < 0) {
            hasInvalidDurationBounds = true;
            break;
          }

          totalSeconds += durationInSeconds;
        }

        if (!hasInvalidDurationBounds) {
          const isoDuration = getDurationInIsoString(totalSeconds);
          seriesDuration = getReadableDuration(isoDuration);
        }

        const startTimes = seriesSummaries.map((summary) => summary.startTime);
        const endTimes = seriesSummaries.map((summary) => summary.endTime);
        seriesStartTime = startTimes.reduce((earliest, current) => (current < earliest ? current : earliest));
        seriesEndTime = endTimes.reduce((latest, current) => (current > latest ? current : latest));
      } else if (isCurrentActiveSeries && view.activeSeriesContext?.startedAt != null) {
        seriesStartTime = view.activeSeriesContext.startedAt;
      }

      const series: ViewerSeriesTab = {
        id: anchoredSeries.id,
        title: anchoredSeries.title,
        subtitle: anchoredSeries.subtitle,
        guildIconUrl: anchoredSeries.guildIconUrl ?? null,
        isActive: activeSeriesId != null ? anchoredSeries.id === activeSeriesId : false,
        teams: getSeriesTeams(view, anchoredSeries, activeSeriesId),
        preSeriesTableData: undefined,
        matchBackgroundUrls:
          anchoredSeries.matchBackgroundUrls ?? seriesSummaries.map((summary) => summary.mapBackgroundUrl ?? "data:,"),
        score: anchoredSeries.score,
        duration: seriesDuration,
        killsDeathsAssistsKda: anchoredSeries.killsDeathsAssistsKda ?? UNKNOWN_KDA_DISPLAY,
        damageDealtTakenRatio: anchoredSeries.damageDealtTakenRatio ?? UNKNOWN_DAMAGE_RATIO_DISPLAY,
        startTime: seriesStartTime,
        endTime: seriesEndTime,
        matches: seriesMatches,
        colorHex: undefined,
      };
      const seriesWithPreSeriesData: ViewerSeriesTab =
        series.teams.length > 0 ? { ...series, preSeriesTableData: toPreSeriesTableData(series.teams) } : series;
      if (activeSeriesId == null && view.hasActiveSeries) {
        fallbackActiveSeriesId = anchoredSeries.id;
      }
      timeline.push({ type: "series", series: seriesWithPreSeriesData });
      continue;
    }

    if (seriesMemberIds.has(match.matchId)) {
      continue;
    }

    timeline.push({ type: "match", match: toMatchTab(match, teamHex, enemyHex) });
  }

  const timelineWithFallback =
    activeSeriesId == null && fallbackActiveSeriesId != null
      ? timeline.map((item) => {
          if (item.type === "match") {
            return item;
          }

          return {
            type: "series" as const,
            series: {
              ...item.series,
              isActive: item.series.id === fallbackActiveSeriesId,
            },
          };
        })
      : timeline;

  const timelineWithPendingActiveSeries =
    view.hasActiveSeries &&
    view.activeSeriesContext != null &&
    !timelineWithFallback.some((item) => item.type === "series" && item.series.isActive)
      ? ([{ type: "series", series: toPendingActiveSeriesTab(view) }, ...timelineWithFallback] as ViewerTimelineItem[])
      : timelineWithFallback;

  const accumulated = accumulate(view.matches);

  return {
    trackerId: view.trackerId,
    gamertag: view.gamertag,
    status: view.status,
    isLive: view.isLive,
    hasActiveSeries: view.hasActiveSeries,
    activeSeriesContext: toViewerActiveSeriesContext(view),
    lastUpdateTime: view.lastUpdateTime,
    timeline: [...timelineWithPendingActiveSeries],
    accumulated,
    statsHighlights: view.statsHighlights,
    preSeriesPlayerInfo: view.preSeriesPlayerInfo,
    teamColors: [getTeamColorOrDefault(preferredTeamColorId, 0), getTeamColorOrDefault(preferredEnemyColorId, 1)],
  };
}
