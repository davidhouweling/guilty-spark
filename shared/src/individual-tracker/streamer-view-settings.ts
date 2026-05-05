export type StreamerViewColorMode = "player" | "observer";

export interface StreamerViewObserverColorOverride {
  readonly teamColor?: string;
  readonly enemyColor?: string;
}

export type StreamerViewObserverColorOverrides = Readonly<Record<string, StreamerViewObserverColorOverride>>;

export interface StreamerViewLayoutOptions {
  readonly viewMode?: "standard" | "wide" | "streamer";
  readonly defaultColorMode?: StreamerViewColorMode;
}

export interface StreamerViewVisibleSections {
  readonly showTicker?: boolean;
  readonly showTabs?: boolean;
  readonly showTeamDetails?: boolean;
}

export interface StreamerViewStyleFlags {
  readonly colorMode?: StreamerViewColorMode;
  readonly teamColor?: string;
  readonly enemyColor?: string;
  readonly observerColorOverrides?: StreamerViewObserverColorOverrides;
}

export interface StreamerViewEffectiveDefaults {
  readonly colorMode: StreamerViewColorMode;
}
