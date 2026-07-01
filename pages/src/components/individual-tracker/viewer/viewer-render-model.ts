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
  IndividualTrackerViewerRenderModel,
  ViewerAccumulatedStats,
  ViewerMatchTab,
  ViewerSeriesTeam,
  ViewerSeriesTab,
  ViewerTimelineItem,
} from "./types";

export interface BuildViewerRenderModelOptions {
  readonly view: TrackerViewState;
  readonly preferredTeamColorId?: string;
  readonly preferredEnemyColorId?: string;
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

  return view.activeSeriesContext.teams.map((team) => ({
    id: team.id,
    name: team.name,
    players: team.players.map((player) => ({
      discordName: player.discordName,
      gamertag: player.gamertag,
    })),
  }));
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
    gameModeName: getGameModeName(summary.gameVariantCategory),
    duration,
    outcome,
    score: summary.score,
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
    if (knownIds.length < 2) {
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

      let seriesDuration = "unknown";
      let seriesStartTime = "";
      let seriesEndTime = "";

      if (seriesSummaries.length > 0) {
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
      }

      const series: ViewerSeriesTab = {
        id: anchoredSeries.id,
        title: anchoredSeries.title,
        subtitle: anchoredSeries.subtitle,
        isActive: activeSeriesId != null ? anchoredSeries.id === activeSeriesId : false,
        teams: getSeriesTeams(view, anchoredSeries, activeSeriesId),
        matchBackgroundUrls:
          anchoredSeries.matchBackgroundUrls ?? seriesSummaries.map((summary) => summary.mapBackgroundUrl ?? "data:,"),
        score: anchoredSeries.score,
        duration: seriesDuration,
        startTime: seriesStartTime,
        endTime: seriesEndTime,
        matches: seriesMatches,
        colorHex: undefined,
      };
      if (activeSeriesId == null && view.hasActiveSeries) {
        fallbackActiveSeriesId = anchoredSeries.id;
      }
      timeline.push({ type: "series", series });
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

  const accumulated = accumulate(view.matches);

  return {
    trackerId: view.trackerId,
    gamertag: view.gamertag,
    status: view.status,
    isLive: view.isLive,
    lastUpdateTime: view.lastUpdateTime,
    timeline: [...timelineWithFallback],
    accumulated,
    statsHighlights: view.statsHighlights,
    teamColors: [getTeamColorOrDefault(preferredTeamColorId, 0), getTeamColorOrDefault(preferredEnemyColorId, 1)],
  };
}
