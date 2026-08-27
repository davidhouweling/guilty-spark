import type { TrackerMatchHistoryEntry } from "../../../services/individual-tracker/types";

export interface ManualSeriesTeamSnapshot {
  readonly name: string;
  readonly members: readonly string[];
}

export type BackfillState = "idle" | "loading" | "done" | "error";

export interface ManualSeriesDialogSnapshot {
  readonly mode: "start" | "edit";
  readonly titleOverride: string;
  readonly subtitleOverride: string;
  readonly teams: readonly ManualSeriesTeamSnapshot[];
  readonly hadInitialTeams: boolean;
  readonly backfillState: BackfillState;
  readonly backfillError: string | null;
  readonly backfillWarning: string | null;
  readonly backfillMatches: readonly TrackerMatchHistoryEntry[];
  readonly selectedBackfillMatchIds: readonly string[];
  readonly busy: boolean;
  readonly submitError: string | null;
}

export interface SeriesInitialData {
  readonly title: string;
  readonly subtitle: string;
  readonly teams: readonly ManualSeriesTeamSnapshot[];
}

interface SeriesTeamWithGamertagPlayers {
  readonly name: string;
  readonly players: readonly { readonly gamertag: string | null }[];
}

// Shared by any presenter that seeds this dialog from a roster of named teams (e.g. a
// NeatQueue-sourced ActiveSeriesContext/ActiveSeriesSummary) -- maps each player down to just
// its display gamertag, falling back to "" for a player with none.
export function toManualSeriesTeams(teams: readonly SeriesTeamWithGamertagPlayers[]): ManualSeriesTeamSnapshot[] {
  return teams.map((team) => ({
    name: team.name,
    members: team.players.map((player) => player.gamertag ?? ""),
  }));
}

const INITIAL_TEAM_MEMBERS: readonly string[] = ["", "", "", ""];

function buildDefaultTeams(): readonly ManualSeriesTeamSnapshot[] {
  return [
    { name: "", members: INITIAL_TEAM_MEMBERS },
    { name: "", members: INITIAL_TEAM_MEMBERS },
  ];
}

function normaliseTeams(data: SeriesInitialData): readonly ManualSeriesTeamSnapshot[] {
  if (data.teams.length === 0) {
    return buildDefaultTeams();
  }
  return data.teams.map((t) => ({
    name: t.name,
    members: t.members.length > 0 ? [...t.members] : [...INITIAL_TEAM_MEMBERS],
  }));
}

function resolveMode(data: SeriesInitialData | undefined, mode: "start" | "edit" | undefined): "start" | "edit" {
  return mode ?? (data != null ? "edit" : "start");
}

export class ManualSeriesDialogStore {
  private snapshot: ManualSeriesDialogSnapshot;
  private readonly subscribers = new Set<() => void>();
  private readonly initialData: SeriesInitialData | undefined;
  private readonly forcedMode: "start" | "edit" | undefined;

  public constructor(initialData?: SeriesInitialData, mode?: "start" | "edit") {
    const teams = initialData != null ? normaliseTeams(initialData) : buildDefaultTeams();
    this.snapshot = {
      mode: resolveMode(initialData, mode),
      titleOverride: initialData?.title ?? "",
      subtitleOverride: initialData?.subtitle ?? "",
      teams,
      hadInitialTeams: (initialData?.teams.length ?? 0) > 0,
      backfillState: "idle",
      backfillError: null,
      backfillWarning: null,
      backfillMatches: [],
      selectedBackfillMatchIds: [],
      busy: false,
      submitError: null,
    };
    this.initialData = initialData;
    this.forcedMode = mode;
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

  public reset(initialData?: SeriesInitialData, mode?: "start" | "edit"): void {
    const data = initialData ?? this.initialData;
    const resolvedMode = mode ?? this.forcedMode;
    const teams = data != null ? normaliseTeams(data) : buildDefaultTeams();
    this.update({
      mode: resolveMode(data, resolvedMode),
      titleOverride: data?.title ?? "",
      subtitleOverride: data?.subtitle ?? "",
      teams,
      hadInitialTeams: (data?.teams.length ?? 0) > 0,
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
