import type {
  TrackerMatchSummary,
  TrackerSeriesGroup,
  TrackerViewState,
} from "@guilty-spark/shared/contracts/individual-tracker/view";
import { getGameModeName } from "@guilty-spark/shared/halo/game-variants";
import { getDurationInIsoString, getReadableDuration } from "@guilty-spark/shared/halo/duration";
import { normalizeOutcomeString, getOutcomeColor } from "@guilty-spark/shared/halo/match-enrichment";
import { differenceInSeconds } from "date-fns";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type {
  IndividualTrackerViewerRenderModel,
  ViewerAccumulatedStats,
  ViewerMatchTab,
  ViewerSeriesTab,
  ViewerTimelineItem,
} from "./types";

export interface BuildViewerRenderModelOptions {
  readonly view: TrackerViewState;
  readonly preferredTeamColorId?: string;
  readonly preferredEnemyColorId?: string;
}

function toMatchTab(summary: TrackerMatchSummary, teamHex: string, enemyHex: string): ViewerMatchTab {
  const outcome = normalizeOutcomeString(summary.outcome);
  const durationInSeconds = differenceInSeconds(new Date(summary.endTime), new Date(summary.startTime));
  const isoDuration = getDurationInIsoString(durationInSeconds);
  const duration = getReadableDuration(isoDuration);

  return {
    matchId: summary.matchId,
    mapName: summary.mapName,
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
      case "win": {
        wins += 1;
        break;
      }
      case "loss": {
        losses += 1;
        break;
      }
      case "tie": {
        ties += 1;
        break;
      }
      case "dnf":
      case "unknown": {
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

      // Calculate series duration, startTime, and endTime
      let seriesDuration = "0 hours";
      let seriesStartTime = "";
      let seriesEndTime = "";

      if (seriesSummaries.length > 0) {
        // Sum all match durations
        let totalSeconds = 0;
        for (const summary of seriesSummaries) {
          totalSeconds += differenceInSeconds(new Date(summary.endTime), new Date(summary.startTime));
        }
        const isoDuration = getDurationInIsoString(totalSeconds);
        seriesDuration = getReadableDuration(isoDuration);

        const startTimes = seriesSummaries.map((summary) => summary.startTime);
        const endTimes = seriesSummaries.map((summary) => summary.endTime);
        seriesStartTime = startTimes.reduce((earliest, current) => (current < earliest ? current : earliest));
        seriesEndTime = endTimes.reduce((latest, current) => (current > latest ? current : latest));
      }

      const series: ViewerSeriesTab = {
        id: anchoredSeries.id,
        title: anchoredSeries.title,
        subtitle: anchoredSeries.subtitle,
        score: anchoredSeries.score,
        duration: seriesDuration,
        startTime: seriesStartTime,
        endTime: seriesEndTime,
        matches: seriesMatches,
        colorHex: undefined,
      };
      timeline.push({ type: "series", series });
      continue;
    }

    if (seriesMemberIds.has(match.matchId)) {
      continue;
    }

    timeline.push({ type: "match", match: toMatchTab(match, teamHex, enemyHex) });
  }

  const accumulated = accumulate(view.matches);

  return {
    trackerId: view.trackerId,
    gamertag: view.gamertag,
    status: view.status,
    isLive: view.isLive,
    lastUpdateTime: view.lastUpdateTime,
    timeline: [...timeline],
    accumulated,
    topBarStats: view.topBarStats,
    teamColors: [getTeamColorOrDefault(preferredTeamColorId, 0), getTeamColorOrDefault(preferredEnemyColorId, 1)],
  };
}
