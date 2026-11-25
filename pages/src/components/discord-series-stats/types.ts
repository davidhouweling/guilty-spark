import type { DisplaySettings, FontSizeSettings, TickerSettings } from "../live-tracker/settings/types";

export interface ArchiveGlobalSettingsUpdates {
  readonly display?: Partial<DisplaySettings>;
  readonly ticker?: Partial<TickerSettings>;
  readonly fontSizes?: Partial<FontSizeSettings>;
}
