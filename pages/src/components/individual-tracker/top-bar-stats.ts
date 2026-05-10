import type { TrackerSearchResult } from "../../services/individual-tracker/types";
import {
  INDIVIDUAL_TOP_BAR_STAT_OPTION_DEFINITIONS,
  type DisplaySettings,
  type IndividualTopBarStatOption,
} from "../streamer-settings/shared-types";
import type { IndividualTrackerViewerRenderModel } from "./types";

export interface IndividualTrackerTopBarStatItem {
  readonly option: IndividualTopBarStatOption;
  readonly label: string;
  readonly value: string;
}

interface TrackedPlayerStatValue {
  readonly value: number;
  readonly display: string;
}

interface BuildIndividualTrackerTopBarStatsOptions {
  readonly renderModel: IndividualTrackerViewerRenderModel | null;
  readonly trackerSummary: TrackerSearchResult | null;
  readonly topBarStatSlots: DisplaySettings["topBarStatSlots"];
}

const optionLabelByValue = new Map<IndividualTopBarStatOption, string>(
  INDIVIDUAL_TOP_BAR_STAT_OPTION_DEFINITIONS.map((definition) => [definition.value, definition.label]),
);

function getTrackedPlayerStatsMap(
  renderModel: IndividualTrackerViewerRenderModel,
): Map<string, TrackedPlayerStatValue> {
  const playerData = renderModel.trackedPlayerTotals?.playerData;
  if (playerData == null) {
    return new Map();
  }

  for (const team of playerData) {
    if (team.players.length === 0) {
      continue;
    }

    const [player] = team.players;
    const statsMap = new Map<string, TrackedPlayerStatValue>();
    for (const stat of player.values) {
      statsMap.set(stat.name, {
        value: stat.value,
        display: stat.display,
      });
    }

    return statsMap;
  }

  return new Map();
}

function getSeriesWonLoss(renderModel: IndividualTrackerViewerRenderModel): { won: number; lost: number } {
  let won = 0;
  let lost = 0;

  for (const item of renderModel.gameplayTimeline) {
    if (item.type !== "group") {
      continue;
    }

    let matchWins = 0;
    let matchLosses = 0;
    for (const match of item.matches) {
      if (/^Win\s*-/.test(match.score)) {
        matchWins += 1;
      }
      if (/^Loss\s*-/.test(match.score)) {
        matchLosses += 1;
      }
    }

    if (matchWins > matchLosses) {
      won += 1;
    }
    if (matchLosses > matchWins) {
      lost += 1;
    }
  }

  return { won, lost };
}

function parseSeriesScore(score: string): { left: number; right: number } | null {
  const match = /^(\d+):(\d+)$/.exec(score.trim());
  if (match == null) {
    return null;
  }

  const left = parseInt(match[1], 10);
  const right = parseInt(match[2], 10);
  if (Number.isNaN(left) || Number.isNaN(right)) {
    return null;
  }

  return { left, right };
}

function getTimelineMatchWonLoss(renderModel: IndividualTrackerViewerRenderModel): { won: number; lost: number } {
  let won = 0;
  let lost = 0;

  for (const item of renderModel.gameplayTimeline) {
    switch (item.type) {
      case "group": {
        const parsedScore = parseSeriesScore(item.seriesScore);
        if (parsedScore != null) {
          won += parsedScore.left;
          lost += parsedScore.right;
        }
        break;
      }
      case "match": {
        if (/^Win\s*-/.test(item.match.score)) {
          won += 1;
        }
        if (/^Loss\s*-/.test(item.match.score)) {
          lost += 1;
        }
        break;
      }
      default: {
        break;
      }
    }
  }

  return { won, lost };
}

function formatRankValue(label: string | null, csrLabel: string | null): string | null {
  const safeLabel = label ?? "";
  const safeCsrLabel = csrLabel ?? "";

  if (safeLabel === "" && safeCsrLabel === "") {
    return null;
  }

  if (safeLabel !== "" && safeCsrLabel !== "") {
    return `${safeLabel} (${safeCsrLabel})`;
  }

  return safeLabel !== "" ? safeLabel : safeCsrLabel;
}

function formatTopBarStatValue(
  renderModel: IndividualTrackerViewerRenderModel,
  trackerSummary: TrackerSearchResult | null,
  option: IndividualTopBarStatOption,
): string | null {
  const { accumulatedStats } = renderModel;
  const trackedStats = getTrackedPlayerStatsMap(renderModel);

  switch (option) {
    case "matches-win-loss": {
      const matches = getTimelineMatchWonLoss(renderModel);
      return `${matches.won.toString()}W:${matches.lost.toString()}L`;
    }
    case "series-win-loss": {
      const series = getSeriesWonLoss(renderModel);
      return `${series.won.toString()}SW:${series.lost.toString()}SL`;
    }
    case "total-games": {
      return accumulatedStats.total.toString();
    }
    case "matchmaking-games": {
      return accumulatedStats.matchmaking.toString();
    }
    case "custom-local-games": {
      return accumulatedStats.customOrLocal.toString();
    }
    case "current-rank": {
      return formatRankValue(trackerSummary?.rankLabel ?? null, trackerSummary?.csrLabel ?? null);
    }
    case "season-peak": {
      return formatRankValue(trackerSummary?.seasonPeakRankTier ?? null, trackerSummary?.seasonPeakCsrLabel ?? null);
    }
    case "all-time-peak": {
      return formatRankValue(trackerSummary?.allTimePeakRankLabel ?? null, trackerSummary?.allTimePeakCsrLabel ?? null);
    }
    case "esra": {
      return null;
    }
    case "kills": {
      return trackedStats.get("Kills")?.display ?? null;
    }
    case "deaths": {
      return trackedStats.get("Deaths")?.display ?? null;
    }
    case "assists": {
      return trackedStats.get("Assists")?.display ?? null;
    }
    case "kda": {
      return trackedStats.get("KDA")?.display ?? null;
    }
    case "headshot-kills": {
      return trackedStats.get("Headshot kills")?.display ?? null;
    }
    case "shots-hit": {
      return trackedStats.get("Shots hit")?.display ?? null;
    }
    case "shots-fired": {
      return trackedStats.get("Shots fired")?.display ?? null;
    }
    case "accuracy": {
      return trackedStats.get("Accuracy")?.display ?? null;
    }
    case "damage-dealt": {
      return trackedStats.get("Damage dealt")?.display ?? null;
    }
    case "damage-taken": {
      return trackedStats.get("Damage taken")?.display ?? null;
    }
    case "damage-ratio": {
      return trackedStats.get("Damage ratio")?.display ?? null;
    }
    case "avg-life-time": {
      return trackedStats.get("Avg life time")?.display ?? null;
    }
    case "avg-damage-per-life": {
      return trackedStats.get("Avg damage per life")?.display ?? null;
    }
    case "kills-deaths-kd": {
      const kills = trackedStats.get("Kills");
      const deaths = trackedStats.get("Deaths");
      if (kills == null || deaths == null) {
        return null;
      }

      const kdRatio = deaths.value === 0 ? kills.value : kills.value / deaths.value;
      const kd = Number.isFinite(kdRatio) ? kdRatio.toFixed(2) : "0.00";

      return `${kills.display}:${deaths.display} (${kd})`;
    }
    case "kills-deaths-assists-kda": {
      const kills = trackedStats.get("Kills");
      const deaths = trackedStats.get("Deaths");
      const assists = trackedStats.get("Assists");
      const kda = trackedStats.get("KDA");
      if (kills == null || deaths == null || assists == null || kda == null) {
        return null;
      }

      return `${kills.display}:${deaths.display}:${assists.display} (${kda.display})`;
    }
    case "shots-hit-fired-accuracy": {
      const shotsHit = trackedStats.get("Shots hit");
      const shotsFired = trackedStats.get("Shots fired");
      const accuracy = trackedStats.get("Accuracy");
      if (shotsHit == null || shotsFired == null || accuracy == null) {
        return null;
      }

      return `${shotsHit.display}:${shotsFired.display} (${accuracy.display})`;
    }
    case "damage-dealt-taken-ratio": {
      const dealt = trackedStats.get("Damage dealt");
      const taken = trackedStats.get("Damage taken");
      const ratio = trackedStats.get("Damage ratio");
      if (dealt == null || taken == null || ratio == null) {
        return null;
      }

      return `${dealt.display}:${taken.display} (${ratio.display})`;
    }
    case "avg-life-damage-per-life": {
      const life = trackedStats.get("Avg life time");
      const damagePerLife = trackedStats.get("Avg damage per life");
      if (life == null || damagePerLife == null) {
        return null;
      }

      return `${life.display} (${damagePerLife.display})`;
    }
    default: {
      return null;
    }
  }
}

export function buildIndividualTrackerTopBarStats({
  renderModel,
  trackerSummary,
  topBarStatSlots,
}: BuildIndividualTrackerTopBarStatsOptions): readonly IndividualTrackerTopBarStatItem[] {
  if (renderModel == null) {
    return [];
  }

  return topBarStatSlots.map((option) => ({
    option,
    label: optionLabelByValue.get(option) ?? option,
    value: formatTopBarStatValue(renderModel, trackerSummary, option) ?? "N/A",
  }));
}
