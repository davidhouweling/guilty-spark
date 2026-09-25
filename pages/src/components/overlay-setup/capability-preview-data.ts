import type { TrackerLiveView } from "@guilty-spark/shared/contracts/individual-tracker/view";
import type { TrackerMatchHistoryEntry } from "../../services/individual-tracker/types";

export interface CapabilityPreviewMatch {
  readonly label: string;
  readonly map: string;
  readonly score: string;
  readonly result: "W" | "L" | "T";
}

export interface CapabilityPreviewData {
  readonly gamertag: string;
  readonly matchmaking: {
    readonly map: string;
    readonly score: string;
    readonly rows: readonly { readonly name: string; readonly score: string; readonly kda: string }[];
  };
  readonly series: {
    readonly score: string;
    readonly matches: readonly CapabilityPreviewMatch[];
  };
  readonly viewer: {
    readonly seriesScore: string;
    readonly matches: readonly CapabilityPreviewMatch[];
  };
}

const FALLBACK_MATCHES: readonly CapabilityPreviewMatch[] = [
  { label: "Game 1", map: "Aquarius", score: "50 - 41", result: "W" },
  { label: "Game 2", map: "Live Fire", score: "39 - 50", result: "L" },
  { label: "Game 3", map: "Recharge", score: "50 - 44", result: "W" },
];

export function createFixtureCapabilityPreviewData(gamertag: string): CapabilityPreviewData {
  return {
    gamertag,
    matchmaking: {
      map: "Aquarius",
      score: "50 - 41",
      rows: [
        { name: gamertag, score: "1,248", kda: "1.72" },
        { name: "RavenSix", score: "1,102", kda: "1.46" },
        { name: "NovaKite", score: "986", kda: "1.18" },
      ],
    },
    series: { score: "2 - 1", matches: FALLBACK_MATCHES },
    viewer: { seriesScore: "2 - 1", matches: FALLBACK_MATCHES },
  };
}

function resultToLabel(result: TrackerMatchHistoryEntry["outcome"]): "W" | "L" | "T" {
  if (result === "Win") {
    return "W";
  }
  if (result === "Loss") {
    return "L";
  }
  return "T";
}

function toPreviewMatch(entry: TrackerMatchHistoryEntry, index: number): CapabilityPreviewMatch {
  return {
    label: `Game ${String(index + 1)}`,
    map: entry.mapName,
    score: entry.resultString,
    result: resultToLabel(entry.outcome),
  };
}

export function createCapabilityPreviewData(
  gamertag: string,
  matchmakingMatches: readonly TrackerMatchHistoryEntry[],
  customMatches: readonly TrackerMatchHistoryEntry[],
): CapabilityPreviewData {
  const fixture = createFixtureCapabilityPreviewData(gamertag);
  const latestMatch = matchmakingMatches.at(0);
  const seriesMatches = customMatches.slice(0, 5).map(toPreviewMatch);
  const resolvedSeriesMatches = seriesMatches.length > 0 ? seriesMatches : fixture.series.matches;
  const seriesWins = resolvedSeriesMatches.filter((match) => match.result === "W").length;
  const seriesLosses = resolvedSeriesMatches.filter((match) => match.result === "L").length;
  const seriesScore = `${String(seriesWins)} - ${String(seriesLosses)}`;

  return {
    gamertag,
    matchmaking:
      latestMatch === undefined
        ? fixture.matchmaking
        : {
            map: latestMatch.mapName,
            score: latestMatch.resultString,
            rows: [{ name: gamertag, score: latestMatch.resultString, kda: "Recent match" }],
          },
    series: { score: seriesScore, matches: resolvedSeriesMatches },
    viewer: { seriesScore, matches: resolvedSeriesMatches },
  };
}

export function createCapabilityPreviewDataFromLiveView(
  gamertag: string,
  view: TrackerLiveView,
): CapabilityPreviewData {
  const matchmakingMatches = view.matches.filter((match) => match.isMatchmaking);
  const matchmakingMatch = matchmakingMatches.length === 0 ? null : matchmakingMatches[0];
  const firstSeries = view.series.at(0);
  const seriesMatches =
    firstSeries === undefined
      ? []
      : firstSeries.matchIds.map((matchId, index) => {
          const match = view.matches.find((candidate) => candidate.matchId === matchId);
          if (match === undefined) {
            return {
              label: `Game ${String(index + 1)}`,
              map: `Match ${String(index + 1)}`,
              score: "Pending",
              result: "T",
            } satisfies CapabilityPreviewMatch;
          }
          return {
            label: `Game ${String(index + 1)}`,
            map: match.mapName,
            score: match.score,
            result: match.outcome === "Win" ? "W" : match.outcome === "Loss" ? "L" : "T",
          } satisfies CapabilityPreviewMatch;
        });
  const resolvedSeriesMatches = seriesMatches.length > 0 ? seriesMatches : FALLBACK_MATCHES;
  const seriesWins = resolvedSeriesMatches.filter((match) => match.result === "W").length;
  const seriesLosses = resolvedSeriesMatches.filter((match) => match.result === "L").length;
  const seriesScore = `${String(seriesWins)} - ${String(seriesLosses)}`;

  return {
    gamertag,
    matchmaking: {
      map: matchmakingMatch === null ? "Matchmaking" : matchmakingMatch.mapName,
      score: matchmakingMatch === null ? "Live" : matchmakingMatch.score,
      rows: [
        {
          name: gamertag,
          score: matchmakingMatch === null ? "Live match" : matchmakingMatch.killsDeathsAssistsKda,
          kda: "Live tracker",
        },
      ],
    },
    series: { score: seriesScore, matches: resolvedSeriesMatches },
    viewer: { seriesScore, matches: resolvedSeriesMatches },
  };
}
