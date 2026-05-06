import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import type { TrackerSearchResult, TrackerMatchHistoryResponse } from "../../../services/individual-tracker/types";
import type {
  IndividualTrackerViewerRenderModel,
  OverlayTab,
  OverlayAccumulatedStats,
  OverlayTickerGroup,
} from "../types";
import type { DisplaySettings, FontSizeSettings, TickerSettings } from "../../streamer-settings/shared-types";

export type PublicViewerVariant = "view" | "overlay";

export type PublicViewerAvailability = "active" | "offline" | "not-found";

export interface PublicViewerSnapshot {
  readonly xuid: string;
  readonly variant: PublicViewerVariant;
  readonly loading: boolean;
  readonly availability: PublicViewerAvailability | null;
  readonly connectionStatus: "idle" | "connecting" | "connected" | "stopped" | "error" | "disconnected" | "not_found";
  readonly errorMessage: string | null;
  readonly trackerState: IndividualTrackerState | null;
  readonly trackerSummary: TrackerSearchResult | null;
  readonly matchHistory: TrackerMatchHistoryResponse | null;
  readonly matchHistoryLoading: boolean;
  readonly renderModel: IndividualTrackerViewerRenderModel | null;
  readonly viewerTeamColor: string;
  readonly viewerEnemyColor: string;
  readonly overlayShowTabs: boolean;
  readonly overlayShowTicker: boolean;
  readonly overlayShowTeamDetails: boolean;
  readonly overlayColorMode: "player" | "observer";

  // Overlay-derived data
  readonly overlayTabs: readonly OverlayTab[];
  readonly overlayAccumulatedStats: OverlayAccumulatedStats | null;
  readonly overlayTickerGroups: readonly OverlayTickerGroup[];
  readonly xuidToDiscordName: Readonly<Record<string, string>>;

  // Settings for overlay
  readonly overlayShowMatchmakingStatsOnly: boolean;
  readonly overlaySelectedSlayerStats: TickerSettings["selectedSlayerStats"];
  readonly overlayShowObjectiveStats: TickerSettings["showObjectiveStats"];
  readonly overlayMedalRarityFilter: TickerSettings["medalRarityFilter"];
  readonly overlayShowPreSeriesInfo: TickerSettings["showPreSeriesInfo"];
  readonly overlayFontSizes: FontSizeSettings;
  readonly overlayShowTitle: DisplaySettings["showTitle"];
  readonly overlayShowSubtitle: DisplaySettings["showSubtitle"];
  readonly overlayShowScore: DisplaySettings["showScore"];
  readonly overlayShowDiscordNames: DisplaySettings["showDiscordNames"];
  readonly overlayShowXboxNames: DisplaySettings["showXboxNames"];
}
