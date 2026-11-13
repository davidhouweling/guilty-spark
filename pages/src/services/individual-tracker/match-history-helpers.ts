import type { MapAsset, PlaylistCsrContainer } from "halo-infinite-api";

export const RANKED_ARENA_PLAYLIST_ID = "edfef3ac-9cbe-4fa2-b949-8f29deafd483";

export function getRankLabel(tier: string, subTier: number): string {
  if (tier === "Onyx") {
    return tier;
  }

  return `${tier} ${(subTier + 1).toString()}`;
}

export function getRankAndCsrLabels(csr: PlaylistCsrContainer): { rankLabel: string | null; csrLabel: string | null } {
  const currentCsr = csr.Current;

  const csrLabel = currentCsr.Value >= 0 ? currentCsr.Value.toString() : "-";
  const rankLabel =
    currentCsr.MeasurementMatchesRemaining > 0 ? "Unranked" : getRankLabel(currentCsr.Tier, currentCsr.SubTier);

  return { rankLabel, csrLabel };
}

export function getCsrLabel(value: number): string | null {
  return value >= 0 ? value.toString() : "-";
}

export function formatDisplayDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: true,
  }).format(date);
}

export function getMapThumbnailUrl(asset: MapAsset): string {
  const thumbnailFile = asset.Files.FileRelativePaths.find((file) => file.includes("thumbnail"));
  if (thumbnailFile != null) {
    return `${asset.Files.Prefix}${thumbnailFile}`;
  }

  const heroFile = asset.Files.FileRelativePaths.find((file) => file.includes("hero"));
  if (heroFile != null) {
    return `${asset.Files.Prefix}${heroFile}`;
  }

  return "data:,";
}
