import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";

export type IndividualTrackerAuthState = "loading" | "unauthenticated" | "authenticated";
export type IndividualTrackerSectionId = "live-trackers" | "stats-highlights" | "streamer-settings";

export interface IndividualTrackerSnapshot {
  readonly authState: IndividualTrackerAuthState;
  readonly errorMessage: string | null;
  readonly activeSection: IndividualTrackerSectionId;
  readonly streamerSettings: StreamerViewSettings;
  readonly gamertag: string | null;
}

export class IndividualTrackerStore {
  public snapshot: IndividualTrackerSnapshot = {
    authState: "loading",
    errorMessage: null,
    activeSection: "live-trackers",
    streamerSettings: {},
    gamertag: null,
  };
  public readonly subscribers = new Set<() => void>();
}
