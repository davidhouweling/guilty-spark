import type { IndividualTrackerSnapshot } from "./types";

export class IndividualTrackerStore {
  public snapshot: IndividualTrackerSnapshot = {
    authState: "loading",
    profileId: null,
    xboxXuid: null,
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
    viewerSettingsSaving: false,
    viewerSettingsErrorMessage: null,
    loading: true,
    errorMessage: null,
  };

  public readonly subscribers = new Set<() => void>();
}
