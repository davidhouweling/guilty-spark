import type { CSSProperties } from "react";
import { isValid, parseISO } from "date-fns";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import type { StatsHeaderItem } from "../stats/stats-header";
import type { ViewerMatchTab, ViewerSeriesTab } from "./viewer/types";

function formatDate(value: string | null): string {
  if (value == null || value === "") {
    return "unknown";
  }

  const date = parseISO(value);
  return isValid(date) ? date.toLocaleString() : "unknown";
}

export function buildMatchHeaderTitle(match: ViewerMatchTab): string {
  return `${match.gameModeName}: ${match.mapName}`;
}

export function buildMatchHeaderMetadata(match: ViewerMatchTab): StatsHeaderItem[] {
  return [
    { label: "Score", value: match.score },
    { label: "Duration", value: match.duration },
    { label: "End time", value: formatDate(match.endTime) },
    { label: "Kills:Deaths:Assists (KDA)", value: match.killsDeathsAssistsKda },
    { label: "Damage D:T (D/T)", value: match.damageDealtTakenRatio },
  ];
}

export function buildSeriesHeaderMetadata(series: ViewerSeriesTab): StatsHeaderItem[] {
  return [
    { label: "Score", value: series.score },
    { label: "Duration", value: series.duration },
    series.isActive
      ? { label: "Start time", value: formatDate(series.startTime) }
      : { label: "End time", value: formatDate(series.endTime) },
    { label: "Kills:Deaths:Assists (KDA)", value: series.killsDeathsAssistsKda },
    { label: "Damage D:T (D/T)", value: series.damageDealtTakenRatio },
  ];
}

export function matchHeaderBackgroundStyle(mapBackgroundUrl: string, fallbackThumbnailUrl?: string): CSSProperties {
  if (mapBackgroundUrl !== "" && mapBackgroundUrl !== "data:,") {
    return {
      "--match-bg": `url(${mapBackgroundUrl})`,
    } as CSSProperties;
  }

  if (fallbackThumbnailUrl != null && fallbackThumbnailUrl !== "" && fallbackThumbnailUrl !== "data:,") {
    return {
      "--match-bg": `url(${fallbackThumbnailUrl})`,
    } as CSSProperties;
  }

  return {
    "--match-bg": "linear-gradient(135deg, #0a0e14 0%, #1a1e24 100%)",
  } as CSSProperties;
}

function getBackgroundAt(backgrounds: readonly string[], index: number): string {
  return Preconditions.checkExists(backgrounds[index], "Expected series background at index");
}

export function seriesHeaderBackgroundStyle(
  matchBackgroundUrls: readonly string[],
  rotationTick: number,
  isTransitioning: boolean,
  isGlitching: boolean,
): CSSProperties {
  const backgrounds = matchBackgroundUrls.filter((url) => url !== "" && url !== "data:,");

  if (backgrounds.length > 0) {
    const currentIndex = rotationTick % backgrounds.length;
    const previousIndex = (currentIndex - 1 + backgrounds.length) % backgrounds.length;
    const currentBackground = getBackgroundAt(backgrounds, currentIndex);
    const previousBackground = getBackgroundAt(backgrounds, previousIndex);

    const baseBackground = isTransitioning && backgrounds.length > 1 ? previousBackground : currentBackground;
    const overlayBackground = currentBackground;

    return {
      "--match-bg": `url(${baseBackground})`,
      "--match-bg-next": `url(${overlayBackground})`,
      "--match-bg-next-opacity": isTransitioning ? 1 : 0,
      "--match-glitch-opacity": isGlitching && backgrounds.length > 1 ? 0.28 : 0,
    } as CSSProperties;
  }

  return {
    "--match-bg": "linear-gradient(135deg, #0a0e14 0%, #1a1e24 100%)",
  } as CSSProperties;
}
