import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import {
  DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS,
  INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT,
  INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTION_DEFINITIONS,
  type IndividualStatsHighlightOption,
  type IndividualStatsHighlightOptionGroup,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { StatsHighlightsSectionStore } from "./stats-highlights-store";
import type {
  StatsHighlightsOptionGroup,
  StatsHighlightsSectionProps,
  StatsHighlightsSectionSnapshot,
  StatsHighlightsSectionViewModel,
} from "./types";

type SyncInput = Pick<
  StatsHighlightsSectionProps,
  "statsHighlightSlots" | "saveStatus" | "saveErrorMessage"
>;

interface Config {
  readonly store: StatsHighlightsSectionStore;
  readonly onStatsHighlightSlotsChange: (statsHighlightSlots: readonly IndividualStatsHighlightOption[]) => void;
}

const HIDE_TOAST_DELAY_MS = 2200;

const STATS_HIGHLIGHTS_GROUP_LABELS: Record<IndividualStatsHighlightOptionGroup, string> = {
  individual: "Individual stats",
  compact: "Compacted stats",
  profile: "Profile stats",
};

const statsHighlightOptionGroups: readonly StatsHighlightsOptionGroup[] = (
  Object.keys(STATS_HIGHLIGHTS_GROUP_LABELS) as IndividualStatsHighlightOptionGroup[]
).map((group) => ({
  group,
  label: STATS_HIGHLIGHTS_GROUP_LABELS[group],
  options: INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTION_DEFINITIONS.filter((definition) => definition.group === group),
}));

function buildStatsHighlightSlots(
  targetCount: number,
  currentSlots: readonly IndividualStatsHighlightOption[],
): readonly IndividualStatsHighlightOption[] {
  const nextSlots = [...currentSlots].slice(0, targetCount);

  for (const option of DEFAULT_INDIVIDUAL_STATS_HIGHLIGHTS_STAT_SLOTS) {
    if (nextSlots.length >= targetCount) {
      return nextSlots;
    }
    if (!nextSlots.includes(option)) {
      nextSlots.push(option);
    }
  }

  for (const definition of INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTION_DEFINITIONS) {
    if (nextSlots.length >= targetCount) {
      return nextSlots;
    }
    if (!nextSlots.includes(definition.value)) {
      nextSlots.push(definition.value);
    }
  }

  return nextSlots;
}

function parseIndividualStatsHighlightOption(value: string): IndividualStatsHighlightOption {
  const definition = INDIVIDUAL_STATS_HIGHLIGHTS_STAT_OPTION_DEFINITIONS.find((candidate) => candidate.value === value);
  return Preconditions.checkExists(definition, "stats highlights option").value;
}

function toDerivedState(statsHighlightSlots: readonly IndividualStatsHighlightOption[]): {
  readonly isEnabled: boolean;
  readonly slotCount: number;
  readonly configuredSlots: readonly IndividualStatsHighlightOption[];
} {
  const isEnabled = statsHighlightSlots.length > 0;
  const slotCount = isEnabled ? statsHighlightSlots.length : INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT;
  return {
    isEnabled,
    slotCount,
    configuredSlots: buildStatsHighlightSlots(slotCount, statsHighlightSlots),
  };
}

export class StatsHighlightsSectionPresenter {
  private readonly config: Config;
  private previousSaveStatus: SyncInput["saveStatus"] = "idle";
  private hideToastTimer: ReturnType<typeof setTimeout> | null = null;
  private isDisposed = false;

  public constructor(config: Config) {
    this.config = config;
  }

  public dispose(): void {
    this.isDisposed = true;
    this.clearHideToastTimer();
  }

  public syncInput(input: SyncInput): void {
    if (this.isDisposed) {
      return;
    }

    const derived = toDerivedState(input.statsHighlightSlots);
    this.config.store.setState({
      ...derived,
      saveStatus: input.saveStatus,
      saveErrorMessage: input.saveErrorMessage,
    });

    this.updateToastVisibility(input.saveStatus);
    this.previousSaveStatus = input.saveStatus;
  }

  public setEnabled(checked: boolean): void {
    if (this.isDisposed) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    const nextSlots = checked
      ? buildStatsHighlightSlots(INDIVIDUAL_STATS_HIGHLIGHTS_DEFAULT_SLOT_COUNT, snapshot.configuredSlots)
      : [];

    this.applySlotChange(nextSlots);
  }

  public setSlotCount(slotCount: number): void {
    if (this.isDisposed) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    const nextSlots = buildStatsHighlightSlots(slotCount, snapshot.configuredSlots);
    this.applySlotChange(nextSlots);
  }

  public setSlotValue(index: number, value: string): void {
    if (this.isDisposed) {
      return;
    }

    const snapshot = this.config.store.getSnapshot();
    const nextSlots = [...snapshot.configuredSlots];
    nextSlots[index] = parseIndividualStatsHighlightOption(value);
    this.applySlotChange(nextSlots);
  }

  public present(snapshot: StatsHighlightsSectionSnapshot): StatsHighlightsSectionViewModel {
    return {
      isEnabled: snapshot.isEnabled,
      slotCount: snapshot.slotCount,
      configuredSlots: snapshot.configuredSlots,
      optionGroups: statsHighlightOptionGroups,
      saveStatus: snapshot.saveStatus,
      saveErrorMessage: snapshot.saveErrorMessage,
      showSaveToast: snapshot.showSaveToast,
    };
  }

  private applySlotChange(nextSlots: readonly IndividualStatsHighlightOption[]): void {
    const derived = toDerivedState(nextSlots);
    this.config.store.setState(derived);
    this.config.onStatsHighlightSlotsChange(nextSlots);
  }

  private updateToastVisibility(saveStatus: SyncInput["saveStatus"]): void {
    const snapshot = this.config.store.getSnapshot();
    let {showSaveToast} = snapshot;

    if (saveStatus === "saving" || saveStatus === "error") {
      showSaveToast = true;
    }

    if (this.previousSaveStatus === "saving" && saveStatus === "saved") {
      showSaveToast = true;
    }

    this.config.store.setState({ showSaveToast });

    if (saveStatus === "saving") {
      this.clearHideToastTimer();
      return;
    }

    if (!showSaveToast) {
      this.clearHideToastTimer();
      return;
    }

    this.clearHideToastTimer();
    this.hideToastTimer = setTimeout(() => {
      if (this.isDisposed) {
        return;
      }
      this.config.store.setState({ showSaveToast: false });
      this.hideToastTimer = null;
    }, HIDE_TOAST_DELAY_MS);
  }

  private clearHideToastTimer(): void {
    if (this.hideToastTimer == null) {
      return;
    }

    clearTimeout(this.hideToastTimer);
    this.hideToastTimer = null;
  }
}
