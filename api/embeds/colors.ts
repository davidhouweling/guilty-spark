/**
 * Standard color palette for Discord embeds.
 * Using consistent colors across all embeds for better UX.
 */

export const EmbedColors = {
  /** Success green - used for successful operations, active states */
  SUCCESS: 0x28a745,

  /** Discord blurple - used for informational embeds, neutral states */
  NEUTRAL: 0x5865f2,

  /** Blue - used for informational content like stats, data displays */
  INFO: 0x3498db,

  /** Warning orange - used for paused states, warnings */
  WARNING: 0xffa500,

  /** Gray - used for stopped/inactive states */
  INACTIVE: 0x808080,
} as const;
