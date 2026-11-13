import type { CondensedMatchHistoryEntry } from "@guilty-spark/shared/contracts/individual-tracker/match-history";

export interface PreparedMatchHistoryEntry extends CondensedMatchHistoryEntry {
  readonly startTime: string;
  readonly endTime: string;
  readonly duration: string;
  readonly resultString: string;
  readonly scoreDisplay: string | null;
}

export interface PreparedMatchHistoryPage {
  readonly matches: readonly PreparedMatchHistoryEntry[];
  readonly suggestedGroupings: readonly (readonly string[])[];
}

export interface CondensedMatchHistoryRequest {
  readonly xuid: string;
  readonly start: number;
  readonly count: number;
  readonly category?: "all" | "custom" | undefined;
  readonly gamertag?: string | undefined;
}

export interface CondensedMatchHistoryService {
  getMatchHistory(request: CondensedMatchHistoryRequest): Promise<PreparedMatchHistoryPage>;
}
