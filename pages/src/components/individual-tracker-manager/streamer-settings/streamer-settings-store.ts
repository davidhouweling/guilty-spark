import {
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

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showTeamDetails: true,
  showDiscordNames: false,
  showXboxNames: true,
  showServerIcon: true,
  showTitle: true,
  showSubtitle: true,
  showScore: true,
};

const DEFAULT_STATS_HIGHLIGHT_SLOTS: readonly IndividualStatsHighlightOption[] =
  DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS.slice(0, INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT);

const DEFAULT_TICKER_SETTINGS: TickerSettings = {
  showTicker: true,
  showTabs: true,
  showPreSeriesInfo: true,
  selectedSlayerStats: ["Score", "Kills", "Deaths", "Assists", "KDA", "Damage dealt", "Damage taken", "Damage ratio"],
  showObjectiveStats: false,
  medalRarityFilter: [2, 3],
};

const DEFAULT_FONT_SIZE_SETTINGS: FontSizeSettings = {
  queueInfo: 100,
  score: 100,
  teams: 100,
  tabs: 100,
  ticker: 100,
};

export class StreamerSettingsStore {
  private snapshot: StreamerSettingsSnapshot;
  private readonly subscribers = new Set<() => void>();

  public constructor() {
    this.snapshot = {
      gamertag: null,
      defaultColorMode: "player",
      playerTeamColor: "cerulean",
      playerEnemyColor: "salmon",
      observerTeamColor: "salmon",
      observerEnemyColor: "cerulean",
      displaySettings: DEFAULT_DISPLAY_SETTINGS,
      tickerSettings: DEFAULT_TICKER_SETTINGS,
      inSeriesShowSeriesTab: true,
      matchmakingShowSummaryTab: true,
      disableTeamPlayerNames: false,
      inSeriesShowTicker: true,
      matchmakingShowTicker: true,
      matchmakingShowStatsHighlights: true,
      inSeriesMyStatsOnly: false,
      matchmakingMyStatsOnly: false,
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
