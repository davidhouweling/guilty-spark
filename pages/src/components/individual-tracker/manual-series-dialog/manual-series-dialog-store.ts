import type { TrackerMatchHistoryEntry } from "../../../services/individual-tracker/types";

export interface ManualSeriesTeamSnapshot {
  readonly name: string;
  readonly members: readonly string[];
}

export type BackfillState = "idle" | "loading" | "done" | "error";

export interface ManualSeriesDialogSnapshot {
  readonly titleOverride: string;
  readonly subtitleOverride: string;
  readonly teams: readonly ManualSeriesTeamSnapshot[];
  readonly backfillState: BackfillState;
  readonly backfillError: string | null;
  readonly backfillWarning: string | null;
  readonly backfillMatches: readonly TrackerMatchHistoryEntry[];
  readonly selectedBackfillMatchIds: readonly string[];
  readonly busy: boolean;
  readonly submitError: string | null;
}

const INITIAL_TEAM_MEMBERS: readonly string[] = ["", "", "", ""];

function buildDefaultTeams(): readonly ManualSeriesTeamSnapshot[] {
  return [
    { name: "", members: INITIAL_TEAM_MEMBERS },
    { name: "", members: INITIAL_TEAM_MEMBERS },
  ];
}

export class ManualSeriesDialogStore {
  private snapshot: ManualSeriesDialogSnapshot;
  private readonly subscribers = new Set<() => void>();

  public constructor() {
    this.snapshot = {
      titleOverride: "",
      subtitleOverride: "",
      teams: buildDefaultTeams(),
      backfillState: "idle",
      backfillError: null,
      backfillWarning: null,
      backfillMatches: [],
      selectedBackfillMatchIds: [],
      busy: false,
      submitError: null,
    };
  }

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): ManualSeriesDialogSnapshot {
    return this.snapshot;
  }

  public reset(): void {
    this.update({
      titleOverride: "",
      subtitleOverride: "",
      teams: buildDefaultTeams(),
      backfillState: "idle",
      backfillError: null,
      backfillWarning: null,
      backfillMatches: [],
      selectedBackfillMatchIds: [],
      busy: false,
      submitError: null,
    });
  }

  public setTitleOverride(titleOverride: string): void {
    this.update({ titleOverride });
  }

  public setSubtitleOverride(subtitleOverride: string): void {
    this.update({ subtitleOverride });
  }

  public setTeams(teams: readonly ManualSeriesTeamSnapshot[]): void {
    this.update({ teams });
  }

  public setBackfillLoading(): void {
    this.update({
      backfillState: "loading",
      backfillError: null,
      backfillWarning: null,
      backfillMatches: [],
      selectedBackfillMatchIds: [],
    });
  }

  public setBackfillDone(
    matches: readonly TrackerMatchHistoryEntry[],
    warning: string | null,
    error: string | null,
  ): void {
    this.update({
      backfillState: "done",
      backfillMatches: matches,
      backfillWarning: warning,
      backfillError: error,
      selectedBackfillMatchIds: [],
    });
  }

  public setBackfillError(error: string): void {
    this.update({
      backfillState: "error",
      backfillError: error,
      backfillMatches: [],
      selectedBackfillMatchIds: [],
    });
  }

  public toggleBackfillMatch(matchId: string): void {
    const current = this.snapshot.selectedBackfillMatchIds;
    const updated = current.includes(matchId) ? current.filter((id) => id !== matchId) : [...current, matchId];
    this.update({ selectedBackfillMatchIds: updated });
  }

  public setBusy(busy: boolean): void {
    this.update({ busy });
  }

  public setSubmitError(submitError: string | null): void {
    this.update({ submitError });
  }

  private update(partial: Partial<ManualSeriesDialogSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
