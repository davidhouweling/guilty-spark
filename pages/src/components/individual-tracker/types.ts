export type IndividualTrackerSectionId = "live-trackers" | "streamer-connections" | "additional-options";

export type AuthState = "loading" | "authenticated" | "unauthenticated";

export interface GameSelectionDialogState {
  readonly trackerId: string;
  readonly trackerLabel: string;
  readonly xuid: string;
  readonly initialSelectedMatchIds: readonly string[];
}

export interface IndividualTrackerSnapshot {
  readonly authState: AuthState;
  readonly activeSection: IndividualTrackerSectionId;
  readonly loading: boolean;
  readonly errorMessage: string | null;
}
