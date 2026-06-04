import { z } from "zod";

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
