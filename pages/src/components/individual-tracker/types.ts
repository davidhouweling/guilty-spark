export type IndividualTrackerSectionId = "live-trackers" | "streamer-connections" | "additional-options";

export type AuthState = "loading" | "authenticated" | "unauthenticated";

export type IndividualTrackerPageMode = "manage" | "view";
export type IndividualTrackerViewSource = "tracker" | "active" | null;

export interface GameSelectionDialogState {
  readonly trackerId: string;
  readonly trackerLabel: string;
  readonly xuid: string;
  readonly initialSelectedMatchIds: readonly string[];
}

export interface IndividualTrackerSnapshot {
  readonly authState: AuthState;
  readonly profileId: string | null;
  readonly mode: IndividualTrackerPageMode;
  readonly viewSource: IndividualTrackerViewSource;
  readonly viewTrackerId: string | null;
  readonly viewConnectionStatus:
    | "idle"
    | "connecting"
    | "connected"
    | "stopped"
    | "error"
    | "disconnected"
    | "not_found";
  readonly viewErrorMessage: string | null;
  readonly viewedTracker: import("@guilty-spark/shared/individual-tracker/types").IndividualTrackerState | null;
  readonly viewedMatchHistory: import("../../services/individual-tracker/types").TrackerMatchHistoryResponse | null;
  readonly viewedMatchHistoryLoading: boolean;
  readonly activeSection: IndividualTrackerSectionId;
  readonly viewerTeamColor: string;
  readonly viewerEnemyColor: string;
  readonly viewerSettingsSaving: boolean;
  readonly viewerSettingsErrorMessage: string | null;
  readonly loading: boolean;
  readonly errorMessage: string | null;
}
