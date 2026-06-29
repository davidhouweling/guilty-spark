import { INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { StatsHighlightsSectionSnapshot } from "./types";

const DEFAULT_SNAPSHOT: StatsHighlightsSectionSnapshot = {
  isEnabled: false,
  slotCount: INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
  configuredSlots: [],
  saveStatus: "idle",
  saveErrorMessage: null,
  showSaveToast: false,
};

export class StatsHighlightsSectionStore {
  private snapshot: StatsHighlightsSectionSnapshot = DEFAULT_SNAPSHOT;
  private readonly subscribers = new Set<() => void>();

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): StatsHighlightsSectionSnapshot {
    return this.snapshot;
  }

  public setState(partial: Partial<StatsHighlightsSectionSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...partial,
      configuredSlots: partial.configuredSlots ?? this.snapshot.configuredSlots,
    };

    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
