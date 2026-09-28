import type {
  OverlayPreviewMode,
  OverlayPreviewResponse,
} from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import {
  DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS,
  INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
  INDIVIDUAL_STATS_HIGHLIGHTS_MAX_SLOT_COUNT,
  INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTION_DEFINITIONS,
  isIndividualStatsHighlightOption,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type {
  IndividualStatsHighlightOption,
  StreamerViewSettings,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { OverlayPreviewService } from "../overlay-preview-types";
import { aFakeTrackerViewStateWith, aFakeTrackerSeriesGroupWith } from "./view.fake";

const DEMO_GAMERTAG = "soundmanD";
const SERIES_TITLE = "Recent Series";
const SERIES_SUBTITLE = "Best of 3";
const DEMO_HIGHLIGHT_VALUES = new Map<IndividualStatsHighlightOption, string>([
  ["matches-win-loss", "7:3"],
  ["kda", "1.72"],
  ["total-games", "13"],
]);
const HIGHLIGHT_LABELS = new Map(
  INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTION_DEFINITIONS.map(({ value, label }) => [value, label]),
);
const DEFAULT_SLOTS = DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS.slice(
  0,
  INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
);

function getDemoHighlights(
  statsHighlightSlots: readonly string[] | undefined,
): { readonly label: string; readonly value: string }[] {
  const slots = (statsHighlightSlots?.filter(isIndividualStatsHighlightOption) ?? DEFAULT_SLOTS).slice(
    0,
    INDIVIDUAL_STATS_HIGHLIGHTS_MAX_SLOT_COUNT,
  );
  return slots.map((slot) => ({
    label: HIGHLIGHT_LABELS.get(slot) ?? slot,
    value: DEMO_HIGHLIGHT_VALUES.get(slot) ?? "N/A",
  }));
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
