import { z } from "zod";

export type IndividualTopBarStatOption =
  | "matches-win-loss"
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

export const INDIVIDUAL_TOP_BAR_DEFAULT_SLOT_COUNT = 6;
export const INDIVIDUAL_TOP_BAR_MAX_SLOT_COUNT = 8;
export const INDIVIDUAL_TOP_BAR_SLOT_COUNT = INDIVIDUAL_TOP_BAR_MAX_SLOT_COUNT;

export type IndividualTopBarStatOptionGroup = "individual" | "compact" | "profile";

export interface IndividualTopBarStatOptionDefinition {
  readonly value: IndividualTopBarStatOption;
  readonly label: string;
  readonly group: IndividualTopBarStatOptionGroup;
}

export const INDIVIDUAL_TOP_BAR_STAT_OPTION_DEFINITIONS: readonly IndividualTopBarStatOptionDefinition[] = [
  { value: "matches-win-loss", label: "Matches Won/Loss", group: "individual" },
  { value: "series-win-loss", label: "Series Won/Loss", group: "individual" },
  { value: "total-games", label: "Total Games", group: "individual" },
  { value: "matchmaking-games", label: "Matchmaking Games", group: "individual" },
  { value: "custom-local-games", label: "Custom/Local Games", group: "individual" },
  { value: "current-rank", label: "Current Rank", group: "profile" },
  { value: "season-peak", label: "Season Peak", group: "profile" },
  { value: "all-time-peak", label: "All Time Peak", group: "profile" },
  { value: "esra", label: "ESRA", group: "profile" },
  { value: "kills", label: "Kills", group: "individual" },
  { value: "deaths", label: "Deaths", group: "individual" },
  { value: "assists", label: "Assists", group: "individual" },
  { value: "kda", label: "KDA", group: "individual" },
  { value: "headshot-kills", label: "Headshot Kills", group: "individual" },
  { value: "shots-hit", label: "Shots Hit", group: "individual" },
  { value: "shots-fired", label: "Shots Fired", group: "individual" },
  { value: "accuracy", label: "Accuracy", group: "individual" },
  { value: "damage-dealt", label: "Damage Dealt", group: "individual" },
  { value: "damage-taken", label: "Damage Taken", group: "individual" },
  { value: "damage-ratio", label: "Damage Ratio", group: "individual" },
  { value: "avg-life-time", label: "Avg Life Time", group: "individual" },
  { value: "avg-damage-per-life", label: "Avg Damage Per Life", group: "individual" },
  { value: "kills-deaths-kd", label: "Kills:Deaths (KD)", group: "compact" },
  { value: "kills-deaths-assists-kda", label: "Kills:Deaths:Assists (KDA)", group: "compact" },
  { value: "shots-hit-fired-accuracy", label: "Shots H:F (Acc)", group: "compact" },
  { value: "damage-dealt-taken-ratio", label: "Damage D:T (D/T)", group: "compact" },
  { value: "avg-life-damage-per-life", label: "Avg Life Time (Damage/Life)", group: "compact" },
];

export const INDIVIDUAL_TOP_BAR_STAT_OPTIONS: readonly IndividualTopBarStatOption[] =
  INDIVIDUAL_TOP_BAR_STAT_OPTION_DEFINITIONS.map((d) => d.value);

export const DEFAULT_INDIVIDUAL_TOP_BAR_STAT_SLOTS: readonly IndividualTopBarStatOption[] = [
  "matches-win-loss",
  "series-win-loss",
  "kills-deaths-assists-kda",
  "damage-dealt-taken-ratio",
  "avg-life-damage-per-life",
  "current-rank",
  "all-time-peak",
  "esra",
];

const streamerViewColorModeSchema = z.enum(["player", "observer"]);

const streamerViewObserverColorOverrideSchema = z.object({
  teamColor: z.string().optional(),
  enemyColor: z.string().optional(),
});

const streamerViewObserverColorOverridesSchema = z.record(z.string(), streamerViewObserverColorOverrideSchema);

const streamerViewFontSizesSchema = z.object({
  queueInfo: z.number().optional(),
  score: z.number().optional(),
  teams: z.number().optional(),
  tabs: z.number().optional(),
  ticker: z.number().optional(),
});

export const streamerViewLayoutOptionsSchema = z.object({
  viewMode: z.enum(["standard", "wide", "streamer"]).optional(),
  defaultColorMode: streamerViewColorModeSchema.optional(),
  fontSizes: streamerViewFontSizesSchema.optional(),
});
export type StreamerViewLayoutOptions = z.infer<typeof streamerViewLayoutOptionsSchema>;

export const streamerViewVisibleSectionsSchema = z.object({
  showTicker: z.boolean().optional(),
  showTabs: z.boolean().optional(),
  showTeamDetails: z.boolean().optional(),
  showDiscordNames: z.boolean().optional(),
  showXboxNames: z.boolean().optional(),
  showServerIcon: z.boolean().optional(),
  showTitle: z.boolean().optional(),
  showSubtitle: z.boolean().optional(),
  showScore: z.boolean().optional(),
  topBarStatSlots: z.array(z.string()).optional(),
  showPreSeriesInfo: z.boolean().optional(),
  selectedSlayerStats: z.array(z.string()).optional(),
  showObjectiveStats: z.boolean().optional(),
  medalRarityFilter: z.array(z.number()).optional(),
});
export type StreamerViewVisibleSections = z.infer<typeof streamerViewVisibleSectionsSchema>;

export const streamerViewStyleFlagsSchema = z.object({
  colorMode: streamerViewColorModeSchema.optional(),
  playerTeamColor: z.string().optional(),
  playerEnemyColor: z.string().optional(),
  observerTeamColor: z.string().optional(),
  observerEnemyColor: z.string().optional(),
  teamColor: z.string().optional(),
  enemyColor: z.string().optional(),
  observerColorOverrides: streamerViewObserverColorOverridesSchema.optional(),
  showPreSeriesInfo: z.boolean().optional(),
  selectedSlayerStats: z.array(z.string()).optional(),
  showObjectiveStats: z.boolean().optional(),
  medalRarityFilter: z.array(z.number()).optional(),
  showMatchmakingStatsOnly: z.boolean().optional(),
});
export type StreamerViewStyleFlags = z.infer<typeof streamerViewStyleFlagsSchema>;

export const streamerViewSettingsSchema = z.object({
  styleFlags: streamerViewStyleFlagsSchema.optional(),
  visibleSections: streamerViewVisibleSectionsSchema.optional(),
  layoutOptions: streamerViewLayoutOptionsSchema.optional(),
});
export type StreamerViewSettings = z.infer<typeof streamerViewSettingsSchema>;

export type StreamerViewColorMode = z.infer<typeof streamerViewColorModeSchema>;
export type StreamerViewObserverColorOverride = z.infer<typeof streamerViewObserverColorOverrideSchema>;
export type StreamerViewObserverColorOverrides = z.infer<typeof streamerViewObserverColorOverridesSchema>;
export type StreamerViewFontSizes = z.infer<typeof streamerViewFontSizesSchema>;

export function parseStreamerViewSettings(row: {
  StyleFlagsJson: string;
  VisibleSectionsJson: string;
  LayoutOptionsJson: string;
}): StreamerViewSettings {
  const styleFlags = streamerViewStyleFlagsSchema.safeParse(JSON.parse(row.StyleFlagsJson));
  const visibleSections = streamerViewVisibleSectionsSchema.safeParse(JSON.parse(row.VisibleSectionsJson));
  const layoutOptions = streamerViewLayoutOptionsSchema.safeParse(JSON.parse(row.LayoutOptionsJson));
  return {
    ...(styleFlags.success && Object.keys(styleFlags.data).length > 0 ? { styleFlags: styleFlags.data } : {}),
    ...(visibleSections.success && Object.keys(visibleSections.data).length > 0
      ? { visibleSections: visibleSections.data }
      : {}),
    ...(layoutOptions.success && Object.keys(layoutOptions.data).length > 0
      ? { layoutOptions: layoutOptions.data }
      : {}),
  };
}
