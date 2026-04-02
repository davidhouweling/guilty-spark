/**
 * Type definitions for streamer overlay settings
 */

import type { ViewMode } from "../../view-mode/view-mode-selector";

export interface FontSizeSettings {
  readonly queueInfo: number;
  readonly score: number;
  readonly teams: number;
  readonly ticker: number;
  readonly tabs: number;
}

export interface PlayerViewColorSettings {
  readonly selectedPlayerId: string | null;
  readonly teamColor: string; // Team color ID
  readonly enemyColor: string; // Enemy color ID
}

export interface ObserverViewColorSettings {
  readonly eagleColor: string;
  readonly cobraColor: string;
}

export type ColorMode = "player" | "observer";

export interface ColorSettings {
  readonly mode: ColorMode;
  readonly playerView: PlayerViewColorSettings;
  readonly observerView: ObserverViewColorSettings;
}

export interface DisplaySettings {
  readonly showTeamDetails: boolean;
  readonly showDiscordNames: boolean;
  readonly showXboxNames: boolean;
  readonly showServerIcon: boolean;
  readonly showTitle: boolean;
  readonly showSubtitle: boolean;
  readonly showScore: boolean;
}

export interface TickerSettings {
  readonly showTicker: boolean;
  readonly showPreSeriesInfo: boolean;
  readonly selectedSlayerStats: readonly string[]; // Stat names from getPlayerSlayerStats
  readonly showObjectiveStats: boolean;
  readonly medalRarityFilter: readonly number[]; // difficultyIndex values [0,1,2,3]
  readonly showTabs: boolean;
}

export interface GlobalStreamerSettings {
  readonly viewMode: ViewMode;
  readonly viewPreview: boolean;
  readonly fontSizes: FontSizeSettings;
  readonly colors: ColorSettings;
  readonly display: DisplaySettings;
  readonly ticker: TickerSettings;
}

export interface SeriesStreamerSettings {
  readonly titleOverride: string | null;
  readonly subTitleOverride: string | null;
  readonly eagleTeamNameOverride: string | null;
  readonly cobraTeamNameOverride: string | null;
  readonly disableTeamPlayerNames: boolean | null;
}

export interface AllStreamerSettings {
  readonly global: GlobalStreamerSettings;
  readonly series: SeriesStreamerSettings;
}

// Default values
export const DEFAULT_VIEW_MODE: ViewMode = "standard";

export const DEFAULT_FONT_SIZES: FontSizeSettings = {
  queueInfo: 100,
  score: 100,
  teams: 100,
  ticker: 100,
  tabs: 100,
};

export const DEFAULT_COLOR_SETTINGS: ColorSettings = {
  mode: "observer",
  playerView: {
    selectedPlayerId: null,
    teamColor: "cerulean", // Blue
    enemyColor: "salmon", // Red
  },
  observerView: {
    eagleColor: "salmon",
    cobraColor: "cerulean",
  },
};

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showTeamDetails: true,
  showDiscordNames: true,
  showXboxNames: true,
  showServerIcon: true,
  showTitle: true,
  showSubtitle: true,
  showScore: true,
};

// All stats from getPlayerSlayerStats
export const ALL_SLAYER_STATS = [
  "Rank",
  "Score",
  "Kills",
  "Deaths",
  "Assists",
  "KDA",
  "Headshot kills",
  "Shots hit",
  "Shots fired",
  "Accuracy",
  "Damage dealt",
  "Damage taken",
  "Damage ratio",
  "Avg life time",
  "Avg damage per life",
] as const;

export const DEFAULT_TICKER_SETTINGS: TickerSettings = {
  showTicker: true,
  showPreSeriesInfo: true,
  selectedSlayerStats: ["Score", "Kills", "Deaths", "Assists", "KDA", "Damage dealt", "Damage taken", "Damage ratio"], // Reasonable defaults
  showObjectiveStats: false,
  medalRarityFilter: [2, 3], // Show Legendary, Mythic (exclude Normal, Heroic)
  showTabs: true,
};

export const DEFAULT_SERIES_SETTINGS: SeriesStreamerSettings = {
  titleOverride: null,
  subTitleOverride: null,
  eagleTeamNameOverride: null,
  cobraTeamNameOverride: null,
  disableTeamPlayerNames: null,
};

export const DEFAULT_GLOBAL_SETTINGS: GlobalStreamerSettings = {
  viewMode: DEFAULT_VIEW_MODE,
  viewPreview: false,
  fontSizes: DEFAULT_FONT_SIZES,
  colors: DEFAULT_COLOR_SETTINGS,
  display: DEFAULT_DISPLAY_SETTINGS,
  ticker: DEFAULT_TICKER_SETTINGS,
};

export const DEFAULT_ALL_SETTINGS: AllStreamerSettings = {
  global: DEFAULT_GLOBAL_SETTINGS,
  series: DEFAULT_SERIES_SETTINGS,
};

// Medal rarity metadata
export const MEDAL_RARITY_LEVELS = [
  { id: 3, name: "Mythic", description: "Extremely rare medals" },
  { id: 2, name: "Legendary", description: "High skill medals" },
  { id: 1, name: "Heroic", description: "Moderate skill medals" },
  { id: 0, name: "Normal", description: "Common medals" },
] as const;
