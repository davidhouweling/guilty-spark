import type {
  TrackerMatchSummary,
  TrackerSeriesGroup,
  TrackerViewState,
} from "@guilty-spark/shared/contracts/individual-tracker/view";
import { UnreachableError } from "@guilty-spark/shared/base/unreachable-error";
import { getTeamColorOrDefault } from "../../team-colors/team-colors";
import type {
  IndividualTrackerViewerRenderModel,
  ViewerAccumulatedStats,
  ViewerMatchTab,
  ViewerSeriesTab,
  ViewerTabOutcome,
  ViewerTimelineItem,
} from "./types";

export interface BuildViewerRenderModelOptions {
  readonly view: TrackerViewState;
  readonly preferredTeamColorId?: string;
  readonly preferredEnemyColorId?: string;
}

function normalizeOutcome(outcome: string): ViewerTabOutcome {
  if (outcome === "Win") {
    return "win";
  }
  if (outcome === "Loss") {
    return "loss";
  }
  if (outcome === "Tie") {
    return "tie";
  }
  if (outcome === "DNF") {
    return "dnf";
  }
  return "unknown";
}

function colorForOutcome(outcome: ViewerTabOutcome, teamHex: string, enemyHex: string): string | undefined {
  switch (outcome) {
    case "win": {
      return teamHex;
    }
    case "loss": {
      return enemyHex;
    }
    case "tie":
    case "dnf":
    case "unknown": {
      return undefined;
    }
    default: {
      throw new UnreachableError(outcome);
    }
  }
}

function toMatchTab(summary: TrackerMatchSummary, teamHex: string, enemyHex: string): ViewerMatchTab {
  const outcome = normalizeOutcome(summary.outcome);
  return {
    matchId: summary.matchId,
    mapName: summary.mapName,
    gameVariantCategory: summary.gameVariantCategory,
    outcome,
    score: summary.score,
    colorHex: colorForOutcome(outcome, teamHex, enemyHex),
    startTime: summary.startTime,
    endTime: summary.endTime,
  };
}

function accumulate(matches: readonly TrackerMatchSummary[]): ViewerAccumulatedStats {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  for (const match of matches) {
    const outcome = normalizeOutcome(match.outcome);
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
      for (const id of anchoredSeries.matchIds) {
        const member = matchesById.get(id);
        if (member !== undefined) {
          seriesMatches.push(toMatchTab(member, teamHex, enemyHex));
        }
      }
      const series: ViewerSeriesTab = {
        id: anchoredSeries.id,
        title: anchoredSeries.title,
        subtitle: anchoredSeries.subtitle,
        score: anchoredSeries.score,
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
    timeline,
    accumulated,
  };
}
