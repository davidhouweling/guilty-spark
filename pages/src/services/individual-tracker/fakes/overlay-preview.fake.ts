import type {
  OverlayPreviewMode,
  OverlayPreviewResponse,
} from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type { IndividualStatsHighlightOption } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { OverlayPreviewService } from "../overlay-preview-types";
import { aFakeTrackerViewStateWith, aFakeTrackerSeriesGroupWith } from "./view.fake";

const DEMO_GAMERTAG = "soundmanD";
const SERIES_TITLE = "Recent Series";
const SERIES_SUBTITLE = "Best of 3";
const DEMO_HIGHLIGHTS = [
  { slot: "matches-win-loss", label: "Won:Loss", value: "7:3" },
  { slot: "kda", label: "KDA", value: "1.72" },
  { slot: "total-games", label: "Total Games", value: "13" },
] as const;

function getDemoHighlights(
  statsHighlightSlots: readonly IndividualStatsHighlightOption[] | undefined,
): { readonly label: string; readonly value: string }[] {
  return DEMO_HIGHLIGHTS.filter((highlight) => statsHighlightSlots === undefined || statsHighlightSlots.includes(highlight.slot))
    .map(({ label, value }) => ({ label, value }));
}

function createResponse(
  mode: OverlayPreviewMode,
  statsHighlightSlots: readonly IndividualStatsHighlightOption[] | undefined,
): OverlayPreviewResponse {
  const baseView = aFakeTrackerViewStateWith({ gamertag: DEMO_GAMERTAG });
  const matches = baseView.matches.map((match) => ({ ...match, isMatchmaking: mode === "matchmaking" }));

  if (mode === "matchmaking") {
    return {
      mode,
      isExample: true,
      view: {
        ...baseView,
        matches,
        hasActiveSeries: false,
        series: [],
        statsHighlights: getDemoHighlights(statsHighlightSlots),
      },
    };
  }

  const seriesMatches = matches.slice(0, 2);
  const series = aFakeTrackerSeriesGroupWith({
    id: "overlay-preview-series",
    matchIds: seriesMatches.map((match) => match.matchId),
    title: SERIES_TITLE,
    subtitle: SERIES_SUBTITLE,
  });
  const teams = [
    { id: 0, name: "Eagle", players: [] },
    { id: 1, name: "Cobra", players: [] },
  ];

  return {
    mode,
    isExample: true,
    view: {
      ...baseView,
      matches: seriesMatches,
      series: [{ ...series, teams }],
      hasActiveSeries: true,
      activeSeriesContext: {
        title: SERIES_TITLE,
        subtitle: SERIES_SUBTITLE,
        guildIconUrl: null,
        teams,
      },
    },
  };
}

export function aFakeOverlayPreviewServiceWith(): OverlayPreviewService {
  return {
    getPreview: async (mode, statsHighlightSlots): Promise<OverlayPreviewResponse> =>
      Promise.resolve(createResponse(mode, statsHighlightSlots)),
  };
}
