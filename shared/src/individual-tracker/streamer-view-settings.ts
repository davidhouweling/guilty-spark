export type StreamerViewColorMode = "player" | "observer";

export interface StreamerViewObserverColorOverride {
  readonly teamColor?: string;
  readonly enemyColor?: string;
}

export type StreamerViewObserverColorOverrides = Readonly<Record<string, StreamerViewObserverColorOverride>>;

export interface StreamerViewLayoutOptions {
  readonly viewMode?: "standard" | "wide" | "streamer";
  readonly defaultColorMode?: StreamerViewColorMode;
  readonly fontSizes?: StreamerViewFontSizes;
}

export interface StreamerViewFontSizes {
  readonly queueInfo?: number;
  readonly score?: number;
  readonly teams?: number;
  readonly ticker?: number;
  readonly tabs?: number;
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
}

export interface StreamerViewEffectiveDefaults {
  readonly colorMode: StreamerViewColorMode;
}
