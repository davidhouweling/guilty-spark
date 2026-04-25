import type { IndividualTrackerSnapshot } from "./types";

export class IndividualTrackerStore {
  public snapshot: IndividualTrackerSnapshot = {
    authState: "loading",
    activeSection: "live-trackers",
    loading: true,
    errorMessage: null,
  };

  public readonly subscribers = new Set<() => void>();
}
