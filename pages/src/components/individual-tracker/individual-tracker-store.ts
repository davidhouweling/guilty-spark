import type { IndividualTrackerSnapshot } from "./types";
import {
  DEFAULT_DISPLAY_SETTINGS,
  DEFAULT_TICKER_SETTINGS,
  DEFAULT_FONT_SIZES,
} from "../live-tracker/settings/types";

export class IndividualTrackerStore {
  public snapshot: IndividualTrackerSnapshot = {
    authState: "loading",
    profileId: null,
    xboxXuid: null,
    settingsActiveTrackerId: null,
    settingsActiveTrackerGamertag: null,
    mode: "manage",
    viewSource: null,
    viewTrackerId: null,
    viewTrackerGamertag: null,
    viewConnectionStatus: "idle",
    viewErrorMessage: null,
    viewedMatchHistoryLoading: false,
    viewerCanManage: false,
    viewerRefreshInProgress: false,
    viewerRefreshStartedAt: null,
    viewerRefreshPending: false,
    viewerRefreshMessage: null,
    viewerTrackerSummary: null,
    viewerRenderModel: null,
    activeSection: "live-trackers",
    viewerTeamColor: "salmon",
    viewerEnemyColor: "cerulean",
    viewerDefaultColorMode: "observer",
    viewerShowTabs: true,
    viewerShowTicker: true,
    viewerShowTeamDetails: true,
    viewerObserverTeamColor: "salmon",
    viewerObserverEnemyColor: "cerulean",
    viewerObserverOverrideTeamColor: null,
    viewerObserverOverrideEnemyColor: null,
    viewerDisplaySettings: DEFAULT_DISPLAY_SETTINGS,
    viewerTickerSettings: DEFAULT_TICKER_SETTINGS,
    viewerFontSizeSettings: DEFAULT_FONT_SIZES,
    viewerSettingsSaving: false,
    viewerSettingsErrorMessage: null,
    loading: true,
    errorMessage: null,
  };

  public readonly subscribers = new Set<() => void>();
}
