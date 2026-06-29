import type {
  IndividualStatsHighlightOption,
  IndividualStatsHighlightOptionDefinition,
} from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import type { SaveStatus } from "../streamer-connections/streamer-connections-store";

export interface StatsHighlightsSectionProps {
  readonly statsHighlightSlots: readonly IndividualStatsHighlightOption[];
  readonly saveStatus: SaveStatus;
  readonly saveErrorMessage: string | null;
  readonly onStatsHighlightSlotsChange: (statsHighlightSlots: readonly IndividualStatsHighlightOption[]) => void;
}

export interface StatsHighlightsSectionSnapshot {
  readonly isEnabled: boolean;
  readonly slotCount: number;
  readonly configuredSlots: readonly IndividualStatsHighlightOption[];
  readonly saveStatus: SaveStatus;
  readonly saveErrorMessage: string | null;
  readonly showSaveToast: boolean;
}

export interface StatsHighlightsOptionGroup {
  readonly group: "individual" | "compact" | "profile";
  readonly label: string;
  readonly options: readonly IndividualStatsHighlightOptionDefinition[];
}

export interface StatsHighlightsSectionViewModel {
  readonly isEnabled: boolean;
  readonly slotCount: number;
  readonly configuredSlots: readonly IndividualStatsHighlightOption[];
  readonly optionGroups: readonly StatsHighlightsOptionGroup[];
  readonly saveStatus: SaveStatus;
  readonly saveErrorMessage: string | null;
  readonly showSaveToast: boolean;
}
