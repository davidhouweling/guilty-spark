import type { IndividualTrackerState } from "@guilty-spark/shared/individual-tracker/types";
import type { GameSelectionDialogState } from "../types";
import type { LiveTrackersPresenter } from "./live-trackers-presenter";

export interface LiveTrackersSnapshot {
  readonly userId: string | null;
  readonly xboxGamertag: string | null;
  readonly activeTracker: IndividualTrackerState | null;
  readonly runningTrackers: readonly { trackerId: string; gamertag: string }[];
  readonly trackerStatuses: Readonly<Record<string, IndividualTrackerState | null>>;
  readonly busy: boolean;
  readonly errorMessage: string | null;
  readonly isAddDialogOpen: boolean;
  readonly gameSelectionDialogState: GameSelectionDialogState | null;
}

export interface LiveTrackersController {
  start: () => void;
  dispose: () => void;
  setSessionContext: (userId: string, xboxGamertag: string | null) => void;
  resetForUnauthenticated: () => void;
  refresh: () => Promise<void>;
}

export interface LiveTrackersSectionController extends LiveTrackersController {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => LiveTrackersSnapshot;
  getTrackerItems: LiveTrackersPresenter["getTrackerItems"];
  getActions: LiveTrackersPresenter["getActions"];
  openAddDialog: LiveTrackersPresenter["openAddDialog"];
  closeAddDialog: LiveTrackersPresenter["closeAddDialog"];
  closeGameSelectionDialog: LiveTrackersPresenter["closeGameSelectionDialog"];
  searchGamertag: LiveTrackersPresenter["searchGamertag"];
  loadMatches: LiveTrackersPresenter["loadMatches"];
  addTracker: LiveTrackersPresenter["addTracker"];
  syncGameSelection: LiveTrackersPresenter["syncGameSelection"];
}
