import { z } from "zod";

export type StreamerViewColorMode = "player" | "observer";

export interface StreamerViewObserverColorOverride {
  readonly teamColor?: string;
  readonly enemyColor?: string;
}

export type StreamerViewObserverColorOverrides = Readonly<Record<string, StreamerViewObserverColorOverride>>;

export interface StreamerViewFontSizes {
  readonly queueInfo?: number;
  readonly score?: number;
  readonly teams?: number;
  readonly tabs?: number;
  readonly ticker?: number;
}

export interface StreamerViewLayoutOptions {
  readonly viewMode?: "standard" | "wide" | "streamer";
  readonly defaultColorMode?: StreamerViewColorMode;
  readonly fontSizes?: StreamerViewFontSizes;
}

export interface StreamerViewVisibleSections {
  readonly showTicker?: boolean;
  readonly showTabs?: boolean;
  readonly showTeamDetails?: boolean;
  readonly showDiscordNames?: boolean;
  readonly showXboxNames?: boolean;
  readonly showServerIcon?: boolean;
  readonly showTitle?: boolean;
  readonly showSubtitle?: boolean;
  readonly showScore?: boolean;
  readonly topBarStatSlots?: readonly string[];
  readonly showPreSeriesInfo?: boolean;
  readonly selectedSlayerStats?: readonly string[];
  readonly showObjectiveStats?: boolean;
  readonly medalRarityFilter?: readonly number[];
}

export interface StreamerViewStyleFlags {
  readonly colorMode?: StreamerViewColorMode;
  readonly playerTeamColor?: string;
  readonly playerEnemyColor?: string;
  readonly observerTeamColor?: string;
  readonly observerEnemyColor?: string;
  readonly teamColor?: string;
  readonly enemyColor?: string;
  readonly observerColorOverrides?: StreamerViewObserverColorOverrides;
  readonly showPreSeriesInfo?: boolean;
  readonly selectedSlayerStats?: readonly string[];
  readonly showObjectiveStats?: boolean;
  readonly medalRarityFilter?: readonly number[];
  readonly showMatchmakingStatsOnly?: boolean;
}

export interface StreamerViewEffectiveDefaults {
  readonly colorMode: StreamerViewColorMode;
}

export const streamerViewFontSizesSchema = z.object({
  queueInfo: z.number().optional(),
  score: z.number().optional(),
  teams: z.number().optional(),
  tabs: z.number().optional(),
  ticker: z.number().optional(),
});

export const streamerViewLayoutOptionsSchema = z.object({
  viewMode: z.enum(["standard", "wide", "streamer"]).optional(),
  defaultColorMode: z.enum(["player", "observer"]).optional(),
  fontSizes: streamerViewFontSizesSchema.optional(),
});

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

export const streamerViewColorModeSchema = z.enum(["player", "observer"]);

export const streamerViewStyleFlagsSchema = z.object({
  colorMode: streamerViewColorModeSchema.optional(),
  playerTeamColor: z.string().optional(),
  playerEnemyColor: z.string().optional(),
  observerTeamColor: z.string().optional(),
  observerEnemyColor: z.string().optional(),
  teamColor: z.string().optional(),
  enemyColor: z.string().optional(),
  observerColorOverrides: z
    .record(
      z.string(),
      z.object({
        teamColor: z.string().optional(),
        enemyColor: z.string().optional(),
      }),
    )
    .optional(),
  showPreSeriesInfo: z.boolean().optional(),
  showObjectiveStats: z.boolean().optional(),
  showMatchmakingStatsOnly: z.boolean().optional(),
  selectedSlayerStats: z.array(z.string()).optional(),
  medalRarityFilter: z.array(z.number()).optional(),
});

export const streamerViewSettingsSchema = z.object({
  styleFlags: streamerViewStyleFlagsSchema.optional(),
  visibleSections: streamerViewVisibleSectionsSchema.optional(),
  layoutOptions: streamerViewLayoutOptionsSchema.optional(),
});

export type StreamerViewSettings = z.infer<typeof streamerViewSettingsSchema>;

export function parseStreamerViewSettings(json: string): StreamerViewSettings {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {};
  }
  const result = streamerViewSettingsSchema.safeParse(parsed);
  if (!result.success) {
    return {};
  }
  return result.data;
}
