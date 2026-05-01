import type { IndividualTrackerSnapshot } from "./types";

export class IndividualTrackerStore {
  public snapshot: IndividualTrackerSnapshot = {
    authState: "loading",
    profileId: null,
    mode: "manage",
    viewSource: null,
    viewTrackerId: null,
    viewConnectionStatus: "idle",
    viewErrorMessage: null,
    viewedTracker: null,
    viewedMatchHistory: null,
    viewedMatchHistoryLoading: false,
    viewerRenderModel: null,
    activeSection: "live-trackers",
    viewerTeamColor: "salmon",
    viewerEnemyColor: "cerulean",
    viewerSettingsSaving: false,
    viewerSettingsErrorMessage: null,
    loading: true,
    errorMessage: null,
  };

  public readonly subscribers = new Set<() => void>();
}
