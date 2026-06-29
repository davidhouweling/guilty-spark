import type {
  IndividualStatsHighlightOption,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { SaveStatus } from "../streamer-connections/streamer-connections-store";
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

  public setConfiguredSlots(configuredSlots: readonly IndividualStatsHighlightOption[]): void {
    const isEnabled = configuredSlots.length > 0;
    this.setState({
      configuredSlots: [...configuredSlots],
      isEnabled,
      slotCount: isEnabled ? configuredSlots.length : this.snapshot.slotCount,
    });
  }

  public setSaveState(saveStatus: SaveStatus, saveErrorMessage: string | null): void {
    this.setState({ saveStatus, saveErrorMessage });
  }
}
