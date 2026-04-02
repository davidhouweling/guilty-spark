import type { ViewMode } from "../../view-mode/view-mode-selector";
import type { AllStreamerSettings } from "./types";
import { DEFAULT_ALL_SETTINGS } from "./types";

/**
 * Parse streamer settings from URL parameters
 * Priority: URL params > provided defaults
 */
export function parseSettingsFromUrl(searchParams: URLSearchParams): AllStreamerSettings {
  const parsed: {
    viewMode?: ViewMode;
    fontSizes?: Record<string, number>;
    colorMode?: "player" | "observer";
    playerColors?: { teamColor?: string; enemyColor?: string; selectedPlayerId?: string | null };
    observerColors?: { eagleColor?: string; cobraColor?: string };
    display?: Record<string, boolean>;
    ticker?: {
      selectedSlayerStats?: string[];
      showObjectiveStats?: boolean;
      medalRarityFilter?: number[];
    };
    series?: {
      queueFirstLineOverride?: string | null;
      queueSecondLineOverride?: string | null;
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
    "showQueueFirstLine",
    "showQueueSecondLine",
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
  const enabledStats = searchParams.get("enabledStats");
  const showObjectiveStats = searchParams.get("showObjectiveStats");
  const medalRarityFilter = searchParams.get("medalRarityFilter");

  if (enabledStats !== null || showObjectiveStats !== null || medalRarityFilter !== null) {
    parsed.ticker = {
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
  const queueFirstLine = searchParams.get("queueFirstLine");
  const queueSecondLine = searchParams.get("queueSecondLine");
  if (queueFirstLine !== null || queueSecondLine !== null) {
    parsed.series = {
      ...(queueFirstLine !== null && { queueFirstLineOverride: queueFirstLine !== "" ? queueFirstLine : null }),
      ...(queueSecondLine !== null && { queueSecondLineOverride: queueSecondLine !== "" ? queueSecondLine : null }),
    };
  }

  // Build final settings object
  return {
    global: {
      ...DEFAULT_ALL_SETTINGS.global,
      viewMode: parsed.viewMode ?? DEFAULT_ALL_SETTINGS.global.viewMode,
      ...(parsed.fontSizes && {
        fontSizes: {
          ...DEFAULT_ALL_SETTINGS.global.fontSizes,
          ...parsed.fontSizes,
        },
      }),
      colors: {
        ...DEFAULT_ALL_SETTINGS.global.colors,
        ...(parsed.colorMode && { mode: parsed.colorMode }),
        playerView: {
          ...DEFAULT_ALL_SETTINGS.global.colors.playerView,
          ...parsed.playerColors,
        },
        observerView: {
          ...DEFAULT_ALL_SETTINGS.global.colors.observerView,
          ...parsed.observerColors,
        },
      },
      ...(parsed.display && {
        display: {
          ...DEFAULT_ALL_SETTINGS.global.display,
          ...parsed.display,
        },
      }),
      ...(parsed.ticker && {
        ticker: {
          ...DEFAULT_ALL_SETTINGS.global.ticker,
          ...parsed.ticker,
        },
      }),
    },
    series: {
      ...DEFAULT_ALL_SETTINGS.series,
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
    params.queueFirstLine = settings.series.titleOverride;
  }
  if (settings.series.subTitleOverride !== null && settings.series.subTitleOverride !== "") {
    params.queueSecondLine = settings.series.subTitleOverride;
  }

  return params;
}

/**
 * Build full URL with streamer settings encoded
 */
export function buildUrlWithSettings(baseUrl: string, settings: AllStreamerSettings, viewMode?: ViewMode): string {
  const url = new URL(baseUrl);

  if (viewMode) {
    url.searchParams.set("viewMode", viewMode);
  }

  // Add all settings
  const params = encodeSettingsToUrlParams(settings);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}
