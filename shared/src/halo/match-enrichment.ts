import type { MatchStats } from "halo-infinite-api";
import { GameVariantCategory } from "halo-infinite-api";

export function getMatchOutcomeLabel(outcomeCode: number | null): "Win" | "Loss" | "Tie" | "DNF" | "Unknown" {
  if (outcomeCode == null) {
    return "Unknown";
  }

  switch (outcomeCode) {
    case 1: {
      return "Tie";
    }
    case 2: {
      return "Win";
    }
    case 3: {
      return "Loss";
    }
    case 4: {
      return "DNF";
    }
    default: {
      return "Unknown";
    }
  }
}

export function buildMatchScore(matchStats: MatchStats, locale?: string): string {
  const scoreString = matchStats.Teams.map((team) => team.Stats.CoreStats.Score.toLocaleString(locale)).join(":");

  if (matchStats.MatchInfo.GameVariantCategory === GameVariantCategory.MultiplayerOddball) {
    const roundsString = matchStats.Teams.map((team) => team.Stats.CoreStats.RoundsWon.toLocaleString(locale)).join(
      ":",
    );
    return `${roundsString} (${scoreString})`;
  }

  return scoreString;
}
