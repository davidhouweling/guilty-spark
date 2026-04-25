import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";

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
  readonly userId: string | null;
  readonly xboxGamertag: string | null;
  readonly activeTracker: IndividualTrackerState | null;
  readonly runningTrackers: readonly { trackerId: string; gamertag: string }[];
  readonly trackerStatuses: Readonly<Record<string, IndividualTrackerState | null>>;
  readonly loading: boolean;
  readonly busy: boolean;
  readonly errorMessage: string | null;
  readonly isAddDialogOpen: boolean;
  readonly gameSelectionDialogState: GameSelectionDialogState | null;
}
