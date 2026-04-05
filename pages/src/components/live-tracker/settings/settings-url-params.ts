import type { ViewMode } from "../../view-mode/view-mode-selector";
import type { AllStreamerSettings } from "./types";
import { DEFAULT_ALL_SETTINGS } from "./types";

/**
 * Parse streamer settings from URL parameters
 * Priority: URL params > provided defaults > DEFAULT_ALL_SETTINGS
 */
export function parseSettingsFromUrl(
  searchParams: URLSearchParams,
  defaults: AllStreamerSettings = DEFAULT_ALL_SETTINGS,
): AllStreamerSettings {
  const parsed: {
    viewMode?: ViewMode;
    fontSizes?: Record<string, number>;
    colorMode?: "player" | "observer";
    playerColors?: { teamColor?: string; enemyColor?: string; selectedPlayerId?: string | null };
    observerColors?: { eagleColor?: string; cobraColor?: string };
    display?: Record<string, boolean>;
    ticker?: {
      showTicker?: boolean;
      showTabs?: boolean;
      showPreSeriesInfo?: boolean;
      selectedSlayerStats?: string[];
      showObjectiveStats?: boolean;
      medalRarityFilter?: number[];
    };
    series?: {
      titleOverride?: string | null;
      subtitleOverride?: string | null;
      eagleTeamNameOverride?: string | null;
      cobraTeamNameOverride?: string | null;
      disableTeamPlayerNames?: boolean | null;
    };
  } = {};

  // View mode
  const viewMode = searchParams.get("viewMode");
  if (viewMode === "standard" || viewMode === "wide" || viewMode === "streamer") {
    parsed.viewMode = viewMode;
  }

  // Color mode
  const colorMode = searchParams.get("colorMode");
  if (colorMode === "player" || colorMode === "observer") {
    parsed.colorMode = colorMode;
  }

  // Player view colors
  const playerTeamColor = searchParams.get("playerTeamColor");
  const playerEnemyColor = searchParams.get("playerEnemyColor");
  const selectedPlayerId = searchParams.get("selectedPlayerId");
  if (
    (playerTeamColor !== null && playerTeamColor !== "") ||
    (playerEnemyColor !== null && playerEnemyColor !== "") ||
    selectedPlayerId !== null
  ) {
    parsed.playerColors = {
      ...(playerTeamColor !== null && playerTeamColor !== "" && { teamColor: playerTeamColor }),
      ...(playerEnemyColor !== null && playerEnemyColor !== "" && { enemyColor: playerEnemyColor }),
      ...(selectedPlayerId !== null && { selectedPlayerId }),
    };
  }

  // Observer view colors
  const eagleColor = searchParams.get("eagleColor");
  const cobraColor = searchParams.get("cobraColor");
  if ((eagleColor !== null && eagleColor !== "") || (cobraColor !== null && cobraColor !== "")) {
    parsed.observerColors = {
      ...(eagleColor !== null && eagleColor !== "" && { eagleColor }),
      ...(cobraColor !== null && cobraColor !== "" && { cobraColor }),
    };
  }

  // Display settings
  const displayKeys = [
    "showTeamDetails",
    "showDiscordNames",
    "showXboxNames",
    "showTitle",
    "showSubtitle",
    "showScore",
  ];
  const displaySettings: Record<string, boolean> = {};
  for (const key of displayKeys) {
    const value = searchParams.get(key);
    if (value === "true" || value === "false") {
      displaySettings[key] = value === "true";
    }
  }
  if (Object.keys(displaySettings).length > 0) {
    parsed.display = displaySettings;
  }

  // Ticker settings
  const showTicker = searchParams.get("showTicker");
  const showTabs = searchParams.get("showTabs");
  const showPreSeriesInfo = searchParams.get("showPreSeriesInfo");
  const enabledStats = searchParams.get("enabledStats");
  const showObjectiveStats = searchParams.get("showObjectiveStats");
  const medalRarityFilter = searchParams.get("medalRarityFilter");

  if (
    showTicker !== null ||
    showTabs !== null ||
    showPreSeriesInfo !== null ||
    enabledStats !== null ||
    showObjectiveStats !== null ||
    medalRarityFilter !== null
  ) {
    parsed.ticker = {
      ...(showTicker === "true" || showTicker === "false" ? { showTicker: showTicker === "true" } : {}),
      ...(showTabs === "true" || showTabs === "false" ? { showTabs: showTabs === "true" } : {}),
      ...(showPreSeriesInfo === "true" || showPreSeriesInfo === "false"
        ? { showPreSeriesInfo: showPreSeriesInfo === "true" }
        : {}),
      ...(enabledStats !== null &&
        enabledStats !== "" && { selectedSlayerStats: enabledStats.split(",").filter((s) => s.length > 0) }),
      ...(showObjectiveStats === "true" || showObjectiveStats === "false"
        ? { showObjectiveStats: showObjectiveStats === "true" }
        : {}),
      ...(medalRarityFilter !== null &&
        medalRarityFilter !== "" && {
          medalRarityFilter: medalRarityFilter
            .split(",")
            .map((s) => Number.parseInt(s, 10))
            .filter((n) => !Number.isNaN(n)),
        }),
    };
  }

  // Font sizes
  const fontSizes: Record<string, number> = {};
  const fontSizesKeys = ["queueInfo", "teamNames", "playerNames", "statsTable", "ticker", "tabs"];
  for (const key of fontSizesKeys) {
    const value = searchParams.get(`fontSize_${key}`);
    if (value !== null) {
      const parsedValue = Number.parseInt(value, 10);
      if (!Number.isNaN(parsedValue) && parsedValue >= 60 && parsedValue <= 140) {
        fontSizes[key] = parsedValue;
      }
    }
  }
  if (Object.keys(fontSizes).length > 0) {
    parsed.fontSizes = fontSizes;
  }

  // Series settings
  const title = searchParams.get("title");
  const subtitle = searchParams.get("subtitle");
  const eagleTeamName = searchParams.get("eagleTeamName");
  const cobraTeamName = searchParams.get("cobraTeamName");
  const disableTeamPlayerNames = searchParams.get("disableTeamPlayerNames");
  if (
    title !== null ||
    subtitle !== null ||
    eagleTeamName !== null ||
    cobraTeamName !== null ||
    disableTeamPlayerNames !== null
  ) {
    parsed.series = {
      ...(title !== null && { titleOverride: title !== "" ? title : null }),
      ...(subtitle !== null && { subtitleOverride: subtitle !== "" ? subtitle : null }),
      ...(eagleTeamName !== null && { eagleTeamNameOverride: eagleTeamName !== "" ? eagleTeamName : null }),
      ...(cobraTeamName !== null && { cobraTeamNameOverride: cobraTeamName !== "" ? cobraTeamName : null }),
      ...(disableTeamPlayerNames === "true" || disableTeamPlayerNames === "false"
        ? { disableTeamPlayerNames: disableTeamPlayerNames === "true" }
        : {}),
    };
  }

  // Build final settings object
  return {
    global: {
      ...defaults.global,
      viewMode: parsed.viewMode ?? defaults.global.viewMode,
      ...(parsed.fontSizes && {
        fontSizes: {
          ...defaults.global.fontSizes,
          ...parsed.fontSizes,
        },
      }),
      colors: {
        ...defaults.global.colors,
        ...(parsed.colorMode && { mode: parsed.colorMode }),
        playerView: {
          ...defaults.global.colors.playerView,
          ...parsed.playerColors,
        },
        observerView: {
          ...defaults.global.colors.observerView,
          ...parsed.observerColors,
        },
      },
      ...(parsed.display && {
        display: {
          ...defaults.global.display,
          ...parsed.display,
        },
      }),
      ...(parsed.ticker && {
        ticker: {
          ...defaults.global.ticker,
          ...parsed.ticker,
        },
      }),
    },
    series: {
      ...defaults.series,
      ...parsed.series,
    },
  };
}

/**
 * Encode all streamer settings into URL parameters
 */
export function encodeSettingsToUrlParams(settings: AllStreamerSettings): Record<string, string> {
  const params: Record<string, string> = {};

  // Color settings
  params.colorMode = settings.global.colors.mode;

  // Player view colors
  if (
    settings.global.colors.playerView.selectedPlayerId !== null &&
    settings.global.colors.playerView.selectedPlayerId !== ""
  ) {
    params.selectedPlayerId = settings.global.colors.playerView.selectedPlayerId;
  }
  params.playerTeamColor = settings.global.colors.playerView.teamColor;
  params.playerEnemyColor = settings.global.colors.playerView.enemyColor;

  // Observer view colors
  params.eagleColor = settings.global.colors.observerView.eagleColor;
  params.cobraColor = settings.global.colors.observerView.cobraColor;

  // Display settings (only include non-default values)
  const { display } = settings.global;
  const defaultDisplay = DEFAULT_ALL_SETTINGS.global.display;
  for (const [key, value] of Object.entries(display) as [string, boolean][]) {
    if (value !== defaultDisplay[key as keyof typeof defaultDisplay]) {
      params[key] = value.toString();
    }
  }

  // Ticker settings
  const { ticker } = settings.global;
  if (!ticker.showTicker) {
    params.showTicker = "false";
  }
  if (!ticker.showTabs) {
    params.showTabs = "false";
  }
  if (!ticker.showPreSeriesInfo) {
    params.showPreSeriesInfo = "false";
  }
  params.enabledStats = ticker.selectedSlayerStats.join(",");
  if (!ticker.showObjectiveStats) {
    params.showObjectiveStats = "false";
  }
  params.medalRarityFilter = ticker.medalRarityFilter.join(",");

  // Font sizes (only include non-default values)
  const { fontSizes } = settings.global;
  for (const [key, value] of Object.entries(fontSizes) as [string, number][]) {
    if (value !== 100) {
      params[`fontSize_${key}`] = value.toString();
    }
  }

  // Series settings
  if (settings.series.titleOverride !== null && settings.series.titleOverride !== "") {
    params.title = settings.series.titleOverride;
  }
  if (settings.series.subtitleOverride !== null && settings.series.subtitleOverride !== "") {
    params.subtitle = settings.series.subtitleOverride;
  }
  if (settings.series.eagleTeamNameOverride !== null && settings.series.eagleTeamNameOverride !== "") {
    params.eagleTeamName = settings.series.eagleTeamNameOverride;
  }
  if (settings.series.cobraTeamNameOverride !== null && settings.series.cobraTeamNameOverride !== "") {
    params.cobraTeamName = settings.series.cobraTeamNameOverride;
  }
  if (settings.series.disableTeamPlayerNames === true) {
    params.disableTeamPlayerNames = "true";
  }

  return params;
}

/**
 * Build full URL with streamer settings encoded
 */
export function buildUrlWithSettings({
  baseUrl,
  settings,
  server,
  queue,
  viewMode,
}: {
  baseUrl: string;
  settings: AllStreamerSettings;
  server?: string;
  queue?: number;
  viewMode?: ViewMode;
}): string {
  const url = new URL(baseUrl);

  if (viewMode) {
    url.searchParams.set("viewMode", viewMode);
  }

  if (server != null && server !== "") {
    url.searchParams.set("server", server);
  }

  if (queue != null) {
    url.searchParams.set("queue", queue.toString());
  }

  // Add all settings
  const params = encodeSettingsToUrlParams(settings);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}
