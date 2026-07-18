import {
  DEFAULT_STREAMER_VIEW_SETTINGS,
  DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS,
  INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type {
  IndividualStatsHighlightOption,
  StreamerViewColorMode,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { DisplaySettings, FontSizeSettings, TickerSettings } from "../../live-tracker/settings/types";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface StreamerSettingsSnapshot {
  readonly gamertag: string | null;
  readonly defaultColorMode: StreamerViewColorMode;
  readonly playerTeamColor: string;
  readonly playerEnemyColor: string;
  readonly observerTeamColor: string;
  readonly observerEnemyColor: string;
  readonly displaySettings: DisplaySettings;
  readonly tickerSettings: TickerSettings;
  readonly inSeriesShowSeriesTab: boolean;
  readonly matchmakingShowSummaryTab: boolean;
  readonly inSeriesShowTabs: boolean;
  readonly matchmakingShowTabs: boolean;
  readonly disableTeamPlayerNames: boolean;
  readonly inSeriesShowTicker: boolean;
  readonly matchmakingShowTicker: boolean;
  readonly matchmakingShowStatsHighlights: boolean;
  readonly inSeriesMyStatsOnly: boolean;
  readonly matchmakingMyStatsOnly: boolean;
  readonly fontSizeSettings: FontSizeSettings;
  readonly statsHighlightSlots: readonly IndividualStatsHighlightOption[];
  readonly saveStatus: SaveStatus;
  readonly saveErrorMessage: string | null;
}

const DEFAULT_STYLE_FLAGS = DEFAULT_STREAMER_VIEW_SETTINGS.styleFlags;
const DEFAULT_VISIBLE_SECTIONS = DEFAULT_STREAMER_VIEW_SETTINGS.visibleSections;
const DEFAULT_FONT_SIZES = DEFAULT_STREAMER_VIEW_SETTINGS.layoutOptions?.fontSizes;

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showTeamDetails: DEFAULT_VISIBLE_SECTIONS?.showTeamDetails ?? true,
  showDiscordNames: DEFAULT_VISIBLE_SECTIONS?.showDiscordNames ?? false,
  showXboxNames: DEFAULT_VISIBLE_SECTIONS?.showXboxNames ?? true,
  showServerIcon: DEFAULT_VISIBLE_SECTIONS?.showServerIcon ?? true,
  showTitle: DEFAULT_VISIBLE_SECTIONS?.showTitle ?? true,
  showSubtitle: DEFAULT_VISIBLE_SECTIONS?.showSubtitle ?? true,
  showScore: DEFAULT_VISIBLE_SECTIONS?.showScore ?? true,
};

const DEFAULT_STATS_HIGHLIGHT_SLOTS: readonly IndividualStatsHighlightOption[] =
  DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS.slice(0, INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT);

const DEFAULT_TICKER_SETTINGS: TickerSettings = {
  showTicker: DEFAULT_VISIBLE_SECTIONS?.showTicker ?? true,
  showTabs: DEFAULT_VISIBLE_SECTIONS?.showTabs ?? true,
  showPreSeriesInfo: DEFAULT_STYLE_FLAGS?.showPreSeriesInfo ?? true,
  selectedSlayerStats: DEFAULT_STYLE_FLAGS?.selectedSlayerStats ?? [],
  showObjectiveStats: DEFAULT_STYLE_FLAGS?.showObjectiveStats ?? false,
  medalRarityFilter: DEFAULT_STYLE_FLAGS?.medalRarityFilter ?? [],
  maxPreviousGamesToShow: DEFAULT_VISIBLE_SECTIONS?.maxPreviousGamesToShow ?? 9,
};

const DEFAULT_FONT_SIZE_SETTINGS: FontSizeSettings = {
  queueInfo: DEFAULT_FONT_SIZES?.queueInfo ?? 100,
  score: DEFAULT_FONT_SIZES?.score ?? 100,
  teams: DEFAULT_FONT_SIZES?.teams ?? 100,
  tabs: DEFAULT_FONT_SIZES?.tabs ?? 100,
  ticker: DEFAULT_FONT_SIZES?.ticker ?? 100,
};

export class StreamerSettingsStore {
  private snapshot: StreamerSettingsSnapshot;
  private readonly subscribers = new Set<() => void>();

  public constructor() {
    this.snapshot = {
      gamertag: null,
      defaultColorMode: DEFAULT_STYLE_FLAGS?.colorMode ?? "player",
      playerTeamColor: DEFAULT_STYLE_FLAGS?.playerTeamColor ?? "cerulean",
      playerEnemyColor: DEFAULT_STYLE_FLAGS?.playerEnemyColor ?? "salmon",
      observerTeamColor: DEFAULT_STYLE_FLAGS?.observerTeamColor ?? "salmon",
      observerEnemyColor: DEFAULT_STYLE_FLAGS?.observerEnemyColor ?? "cerulean",
      displaySettings: DEFAULT_DISPLAY_SETTINGS,
      tickerSettings: DEFAULT_TICKER_SETTINGS,
      inSeriesShowSeriesTab: DEFAULT_STYLE_FLAGS?.inSeriesShowSeriesTab ?? true,
      matchmakingShowSummaryTab: DEFAULT_STYLE_FLAGS?.matchmakingShowSummaryTab ?? true,
      inSeriesShowTabs: DEFAULT_STYLE_FLAGS?.inSeriesShowTabs ?? DEFAULT_VISIBLE_SECTIONS?.showTabs ?? true,
      matchmakingShowTabs: DEFAULT_STYLE_FLAGS?.matchmakingShowTabs ?? DEFAULT_VISIBLE_SECTIONS?.showTabs ?? true,
      disableTeamPlayerNames: DEFAULT_STYLE_FLAGS?.disableTeamPlayerNames ?? false,
      inSeriesShowTicker: DEFAULT_STYLE_FLAGS?.inSeriesShowTicker ?? true,
      matchmakingShowTicker: DEFAULT_STYLE_FLAGS?.matchmakingShowTicker ?? true,
      matchmakingShowStatsHighlights: DEFAULT_STYLE_FLAGS?.matchmakingShowStatsHighlights ?? true,
      inSeriesMyStatsOnly: DEFAULT_STYLE_FLAGS?.inSeriesMyStatsOnly ?? false,
      matchmakingMyStatsOnly: DEFAULT_STYLE_FLAGS?.matchmakingMyStatsOnly ?? false,
      fontSizeSettings: DEFAULT_FONT_SIZE_SETTINGS,
      statsHighlightSlots: DEFAULT_STATS_HIGHLIGHT_SLOTS,
      saveStatus: "idle",
      saveErrorMessage: null,
    };
  }

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): StreamerSettingsSnapshot {
    return this.snapshot;
  }

  public setGamertag(gamertag: string | null): void {
    this.update({ gamertag });
  }

  public batchUpdate(partial: Partial<StreamerSettingsSnapshot>): void {
    this.update(partial);
  }

  public setDefaultColorMode(defaultColorMode: StreamerViewColorMode): void {
    this.update({ defaultColorMode });
  }

  public setPlayerColors(playerTeamColor: string, playerEnemyColor: string): void {
    this.update({ playerTeamColor, playerEnemyColor });
  }

  public setObserverColors(observerTeamColor: string, observerEnemyColor: string): void {
    this.update({ observerTeamColor, observerEnemyColor });
  }

  public setDisplaySettings(displaySettings: DisplaySettings): void {
    this.update({ displaySettings });
  }

  public setTickerSettings(tickerSettings: TickerSettings): void {
    this.update({ tickerSettings });
  }

  public setFontSizeSettings(fontSizeSettings: FontSizeSettings): void {
    this.update({ fontSizeSettings });
  }

  public setStatsHighlightSlots(statsHighlightSlots: readonly IndividualStatsHighlightOption[]): void {
    this.update({ statsHighlightSlots: [...statsHighlightSlots] });
  }

  public setSaving(): void {
    this.update({ saveStatus: "saving", saveErrorMessage: null });
  }

  public setSaved(): void {
    this.update({ saveStatus: "saved", saveErrorMessage: null });
  }

  public setSaveError(message: string): void {
    this.update({ saveStatus: "error", saveErrorMessage: message });
  }

  private update(partial: Partial<StreamerSettingsSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
