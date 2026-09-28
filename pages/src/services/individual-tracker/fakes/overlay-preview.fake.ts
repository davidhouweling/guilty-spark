import type {
  OverlayPreviewMode,
  OverlayPreviewResponse,
} from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
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
  statsHighlightSlots: readonly string[] | undefined,
): { readonly label: string; readonly value: string }[] {
  const slots = statsHighlightSlots ?? DEMO_HIGHLIGHTS.map(({ slot }) => slot);
  return slots.flatMap((slot) => {
    const highlight = DEMO_HIGHLIGHTS.find((candidate) => candidate.slot === slot);
    return highlight === undefined ? [] : [{ label: highlight.label, value: highlight.value }];
  });
}

function createResponse(
  mode: OverlayPreviewMode,
  previewSettings: StreamerViewSettings | undefined,
): OverlayPreviewResponse {
  const statsHighlightSlots = previewSettings?.visibleSections?.statsHighlightSlots;
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
        streamerSettings: previewSettings,
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
      streamerSettings: previewSettings,
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
    getPreview: async (mode, previewSettings): Promise<OverlayPreviewResponse> =>
      Promise.resolve(createResponse(mode, previewSettings)),
  };
}
