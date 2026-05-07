/**
 * Shared type definitions for streamer overlay settings
 * Used by both NeatQueue live tracker and individual tracker overlays
 */

export type ViewMode = "standard" | "wide" | "streamer";

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

export type IndividualTopBarStatOption =
  | "games-win-loss"
  | "series-win-loss"
  | "total-games"
  | "matchmaking-games"
  | "custom-local-games"
  | "current-rank"
  | "season-peak"
  | "all-time-peak"
  | "esra"
  | "kills"
  | "deaths"
  | "assists"
  | "kda"
  | "headshot-kills"
  | "shots-hit"
  | "shots-fired"
  | "accuracy"
  | "damage-dealt"
  | "damage-taken"
  | "damage-ratio"
  | "avg-life-time"
  | "avg-damage-per-life"
  | "kills-deaths-kd"
  | "kills-deaths-assists-kda"
  | "shots-hit-fired-accuracy"
  | "damage-dealt-taken-ratio"
  | "avg-life-damage-per-life";

export const INDIVIDUAL_TOP_BAR_SLOT_COUNT = 6;

export interface IndividualTopBarStatOptionDefinition {
  readonly value: IndividualTopBarStatOption;
  readonly label: string;
  readonly group: "summary" | "viewer-table" | "compact";
}

export const INDIVIDUAL_TOP_BAR_STAT_OPTION_DEFINITIONS: readonly IndividualTopBarStatOptionDefinition[] = [
  { value: "games-win-loss", label: "Games Won/Loss", group: "summary" },
  { value: "series-win-loss", label: "Series Won/Loss", group: "summary" },
  { value: "total-games", label: "Total Games", group: "summary" },
  { value: "matchmaking-games", label: "Matchmaking Games", group: "summary" },
  { value: "custom-local-games", label: "Custom/Local Games", group: "summary" },
  { value: "current-rank", label: "Current Rank", group: "summary" },
  { value: "season-peak", label: "Season Peak", group: "summary" },
  { value: "all-time-peak", label: "All Time Peak", group: "summary" },
  { value: "esra", label: "ESRA", group: "summary" },
  { value: "kills", label: "Kills", group: "viewer-table" },
  { value: "deaths", label: "Deaths", group: "viewer-table" },
  { value: "assists", label: "Assists", group: "viewer-table" },
  { value: "kda", label: "KDA", group: "viewer-table" },
  { value: "headshot-kills", label: "Headshot Kills", group: "viewer-table" },
  { value: "shots-hit", label: "Shots Hit", group: "viewer-table" },
  { value: "shots-fired", label: "Shots Fired", group: "viewer-table" },
  { value: "accuracy", label: "Accuracy", group: "viewer-table" },
  { value: "damage-dealt", label: "Damage Dealt", group: "viewer-table" },
  { value: "damage-taken", label: "Damage Taken", group: "viewer-table" },
  { value: "damage-ratio", label: "Damage Ratio", group: "viewer-table" },
  { value: "avg-life-time", label: "Avg Life Time", group: "viewer-table" },
  { value: "avg-damage-per-life", label: "Avg Damage Per Life", group: "viewer-table" },
  { value: "kills-deaths-kd", label: "Kills:Deaths (KD)", group: "compact" },
  { value: "kills-deaths-assists-kda", label: "Kills:Deaths:Assists (KDA)", group: "compact" },
  { value: "shots-hit-fired-accuracy", label: "Shots H:F (Acc)", group: "compact" },
  { value: "damage-dealt-taken-ratio", label: "Damage D:T (D/T)", group: "compact" },
  { value: "avg-life-damage-per-life", label: "Avg Life Time (Damage/Life)", group: "compact" },
];

export const INDIVIDUAL_TOP_BAR_STAT_OPTIONS: readonly IndividualTopBarStatOption[] = [
  ...INDIVIDUAL_TOP_BAR_STAT_OPTION_DEFINITIONS.map((option) => option.value),
];

export function isIndividualTopBarStatOption(value: string): value is IndividualTopBarStatOption {
  return INDIVIDUAL_TOP_BAR_STAT_OPTIONS.includes(value as IndividualTopBarStatOption);
}

export interface DisplaySettings {
  readonly showTeamDetails: boolean;
  readonly showDiscordNames: boolean;
  readonly showXboxNames: boolean;
  readonly showServerIcon: boolean;
  readonly showTitle: boolean;
  readonly showSubtitle: boolean;
  readonly showScore: boolean;
  readonly topBarStatSlots: readonly IndividualTopBarStatOption[];
}

export interface TickerSettings {
  readonly showTicker: boolean;
  readonly showPreSeriesInfo: boolean;
  readonly selectedSlayerStats: readonly string[]; // Stat names from getPlayerSlayerStats
  readonly showObjectiveStats: boolean;
  readonly medalRarityFilter: readonly number[]; // difficultyIndex values [0,1,2,3]
  readonly showTabs: boolean;
  readonly showMatchmakingStatsOnly?: boolean; // Individual tracker extension
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
  readonly subtitleOverride: string | null;
  readonly eagleTeamNameOverride: string | null;
  readonly cobraTeamNameOverride: string | null;
  readonly disableTeamPlayerNames: boolean | null;
}

export interface AllStreamerSettings {
  readonly global: GlobalStreamerSettings;
  readonly series: SeriesStreamerSettings;
}

// ============================================================================
// Default values
// ============================================================================

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
  topBarStatSlots: [
    "games-win-loss",
    "series-win-loss",
    "kills-deaths-assists-kda",
    "damage-dealt-taken-ratio",
    "avg-life-damage-per-life",
    "current-rank",
  ],
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
  showMatchmakingStatsOnly: false,
};

export const DEFAULT_SERIES_SETTINGS: SeriesStreamerSettings = {
  titleOverride: null,
  subtitleOverride: null,
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
