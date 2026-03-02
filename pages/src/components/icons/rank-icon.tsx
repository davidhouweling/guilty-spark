import type { JSX } from "react";
import bronze1Png from "../../assets/ranks/bronze1.png";
import bronze2Png from "../../assets/ranks/bronze2.png";
import bronze3Png from "../../assets/ranks/bronze3.png";
import bronze4Png from "../../assets/ranks/bronze4.png";
import bronze5Png from "../../assets/ranks/bronze5.png";
import bronze6Png from "../../assets/ranks/bronze6.png";
import silver1Png from "../../assets/ranks/silver1.png";
import silver2Png from "../../assets/ranks/silver2.png";
import silver3Png from "../../assets/ranks/silver3.png";
import silver4Png from "../../assets/ranks/silver4.png";
import silver5Png from "../../assets/ranks/silver5.png";
import silver6Png from "../../assets/ranks/silver6.png";
import gold1Png from "../../assets/ranks/gold1.png";
import gold2Png from "../../assets/ranks/gold2.png";
import gold3Png from "../../assets/ranks/gold3.png";
import gold4Png from "../../assets/ranks/gold4.png";
import gold5Png from "../../assets/ranks/gold5.png";
import gold6Png from "../../assets/ranks/gold6.png";
import platinum1Png from "../../assets/ranks/platinum1.png";
import platinum2Png from "../../assets/ranks/platinum2.png";
import platinum3Png from "../../assets/ranks/platinum3.png";
import platinum4Png from "../../assets/ranks/platinum4.png";
import platinum5Png from "../../assets/ranks/platinum5.png";
import platinum6Png from "../../assets/ranks/platinum6.png";
import diamond1Png from "../../assets/ranks/diamond1.png";
import diamond2Png from "../../assets/ranks/diamond2.png";
import diamond3Png from "../../assets/ranks/diamond3.png";
import diamond4Png from "../../assets/ranks/diamond4.png";
import diamond5Png from "../../assets/ranks/diamond5.png";
import diamond6Png from "../../assets/ranks/diamond6.png";
import onyxPng from "../../assets/ranks/onyx.png";
import unranked0of5Png from "../../assets/ranks/unranked_0of5.png";
import unranked1of5Png from "../../assets/ranks/unranked_1of5.png";
import unranked2of5Png from "../../assets/ranks/unranked_2of5.png";
import unranked3of5Png from "../../assets/ranks/unranked_3of5.png";
import unranked4of5Png from "../../assets/ranks/unranked_4of5.png";
import unranked0of10Png from "../../assets/ranks/unranked_0of10.png";
import unranked1of10Png from "../../assets/ranks/unranked_1of10.png";
import unranked2of10Png from "../../assets/ranks/unranked_2of10.png";
import unranked3of10Png from "../../assets/ranks/unranked_3of10.png";
import unranked4of10Png from "../../assets/ranks/unranked_4of10.png";
import unranked5of10Png from "../../assets/ranks/unranked_5of10.png";
import unranked6of10Png from "../../assets/ranks/unranked_6of10.png";
import unranked7of10Png from "../../assets/ranks/unranked_7of10.png";
import unranked8of10Png from "../../assets/ranks/unranked_8of10.png";
import unranked9of10Png from "../../assets/ranks/unranked_9of10.png";

interface RankIconProps {
  rankTier: string | null;
  subTier: number | null;
  measurementMatchesRemaining: number | null;
  initialMeasurementMatches: number | null;
  size?: "x-small" | "small" | "medium" | "large" | "x-large";
}

const ranks = new Map<string, string>([
  ["Bronze1", bronze1Png.src],
  ["Bronze2", bronze2Png.src],
  ["Bronze3", bronze3Png.src],
  ["Bronze4", bronze4Png.src],
  ["Bronze5", bronze5Png.src],
  ["Bronze6", bronze6Png.src],
  ["Silver1", silver1Png.src],
  ["Silver2", silver2Png.src],
  ["Silver3", silver3Png.src],
  ["Silver4", silver4Png.src],
  ["Silver5", silver5Png.src],
  ["Silver6", silver6Png.src],
  ["Gold1", gold1Png.src],
  ["Gold2", gold2Png.src],
  ["Gold3", gold3Png.src],
  ["Gold4", gold4Png.src],
  ["Gold5", gold5Png.src],
  ["Gold6", gold6Png.src],
  ["Platinum1", platinum1Png.src],
  ["Platinum2", platinum2Png.src],
  ["Platinum3", platinum3Png.src],
  ["Platinum4", platinum4Png.src],
  ["Platinum5", platinum5Png.src],
  ["Platinum6", platinum6Png.src],
  ["Diamond1", diamond1Png.src],
  ["Diamond2", diamond2Png.src],
  ["Diamond3", diamond3Png.src],
  ["Diamond4", diamond4Png.src],
  ["Diamond5", diamond5Png.src],
  ["Diamond6", diamond6Png.src],
  ["Onyx", onyxPng.src],
  ["Unranked_0of5", unranked0of5Png.src],
  ["Unranked_1of5", unranked1of5Png.src],
  ["Unranked_2of5", unranked2of5Png.src],
  ["Unranked_3of5", unranked3of5Png.src],
  ["Unranked_4of5", unranked4of5Png.src],
  ["Unranked_0of10", unranked0of10Png.src],
  ["Unranked_1of10", unranked1of10Png.src],
  ["Unranked_2of10", unranked2of10Png.src],
  ["Unranked_3of10", unranked3of10Png.src],
  ["Unranked_4of10", unranked4of10Png.src],
  ["Unranked_5of10", unranked5of10Png.src],
  ["Unranked_6of10", unranked6of10Png.src],
  ["Unranked_7of10", unranked7of10Png.src],
  ["Unranked_8of10", unranked8of10Png.src],
  ["Unranked_9of10", unranked9of10Png.src],
]);

const sizeMap = new Map<RankIconProps["size"], number>([
  ["x-small", 16],
  ["small", 24],
  ["medium", 32],
  ["large", 48],
  ["x-large", 64],
]);

function getRankKey(
  rankTier: string | null,
  subTier: number | null,
  measurementMatchesRemaining: number | null,
  initialMeasurementMatches: number | null,
): string | null {
  // Handle unranked players (still in placement matches)
  if (measurementMatchesRemaining !== null && measurementMatchesRemaining > 0) {
    const matchesCompleted =
      initialMeasurementMatches !== null ? initialMeasurementMatches - measurementMatchesRemaining : 0;
    return `Unranked_${matchesCompleted.toString()}of${initialMeasurementMatches?.toString() ?? "10"}`;
  }

  // Handle ranked players
  if (rankTier === null) {
    return null;
  }

  // Onyx doesn't have subtiers
  if (rankTier === "Onyx") {
    return "Onyx";
  }

  // For other ranks, use the subtier
  const tier = subTier ?? 1;
  return `${rankTier}${tier.toString()}`;
}

export function RankIcon({
  rankTier,
  subTier,
  measurementMatchesRemaining,
  initialMeasurementMatches,
  size = "medium",
}: RankIconProps): JSX.Element | null {
  const rankKey = getRankKey(rankTier, subTier, measurementMatchesRemaining, initialMeasurementMatches);
  if (rankKey === null) {
    return null;
  }

  const rankSrc = ranks.get(rankKey);
  if (rankSrc === undefined) {
    return null;
  }

  const sizePx = sizeMap.get(size) ?? 32;
  const rankName = rankTier ?? "Unranked";

  return <img src={rankSrc} alt={rankName} title={rankName} width={sizePx} height={sizePx} />;
}
