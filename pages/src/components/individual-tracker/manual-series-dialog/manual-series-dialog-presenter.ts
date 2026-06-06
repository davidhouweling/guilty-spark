import type {
  IndividualTrackerService,
  TrackerMatchHistoryEntry,
  TrackerSearchResult,
} from "../../../services/individual-tracker/types";
import type {
  ManualSeriesDialogSnapshot,
  ManualSeriesDialogStore,
  ManualSeriesTeamSnapshot,
} from "./manual-series-dialog-store";

interface Config {
  readonly trackerId: string;
  readonly store: ManualSeriesDialogStore;
  readonly individualTrackerService: IndividualTrackerService;
  readonly onSeriesStarted: () => void;
}

function collectUniqueTeamMembers(teams: readonly ManualSeriesTeamSnapshot[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const team of teams) {
    for (const member of team.members) {
      const normalized = member.trim();
      if (normalized !== "" && !seen.has(normalized)) {
        seen.add(normalized);
        result.push(normalized);
      }
    }
  }
  return result;
}

function computeMatchIntersection(histories: readonly { readonly matches: readonly TrackerMatchHistoryEntry[] }[]): {
  readonly intersection: ReadonlySet<string>;
  readonly matchById: ReadonlyMap<string, TrackerMatchHistoryEntry>;
} {
  const historiesWithData = histories.filter((h) => h.matches.length > 0);

  const matchById = new Map<string, TrackerMatchHistoryEntry>();
  for (const entry of historiesWithData) {
    for (const match of entry.matches) {
      if (!matchById.has(match.matchId)) {
        matchById.set(match.matchId, match);
      }
    }
  }

  if (historiesWithData.length === 0) {
    return { intersection: new Set(), matchById };
  }

  const intersection = new Set(historiesWithData[0].matches.map((m) => m.matchId));
  for (const entry of historiesWithData.slice(1)) {
    const entryIds = new Set(entry.matches.map((m) => m.matchId));
    for (const matchId of intersection) {
      if (!entryIds.has(matchId)) {
        intersection.delete(matchId);
      }
    }
  }

  return { intersection, matchById };
}

function sortCandidateMatches(
  intersection: ReadonlySet<string>,
  matchById: ReadonlyMap<string, TrackerMatchHistoryEntry>,
): readonly TrackerMatchHistoryEntry[] {
  return Array.from(intersection)
    .map((matchId) => matchById.get(matchId))
    .filter((match): match is TrackerMatchHistoryEntry => match != null)
    .sort((left, right) => {
      const leftTime = new Date(left.startTimeIso ?? left.startTime).getTime();
      const rightTime = new Date(right.startTimeIso ?? right.startTime).getTime();
      return rightTime - leftTime;
    });
}

export class ManualSeriesDialogPresenter {
  private readonly config: Config;
  private disposed = false;

  public constructor(config: Config) {
    this.config = config;
  }

  public dispose(): void {
    this.disposed = true;
  }

  private checkDisposed(): boolean {
    return this.disposed;
  }

  public static present(snapshot: ManualSeriesDialogSnapshot): ManualSeriesDialogSnapshot {
    return snapshot;
  }

  public setTitleOverride(value: string): void {
    if (this.checkDisposed()) {
      return;
    }
    this.config.store.setTitleOverride(value);
  }

  public setSubtitleOverride(value: string): void {
    if (this.checkDisposed()) {
      return;
    }
    this.config.store.setSubtitleOverride(value);
  }

  public setTeamName(teamIndex: number, name: string): void {
    if (this.checkDisposed()) {
      return;
    }
    const { teams } = this.config.store.getSnapshot();
    const updated = teams.map((team, index) => (index === teamIndex ? { ...team, name } : team));
    this.config.store.setTeams(updated);
  }

  public setTeamMember(teamIndex: number, memberIndex: number, value: string): void {
    if (this.checkDisposed()) {
      return;
    }
    const { teams } = this.config.store.getSnapshot();
    const updated = teams.map((team, tIdx) => {
      if (tIdx !== teamIndex) {
        return team;
      }
      const members = team.members.map((m, mIdx) => (mIdx === memberIndex ? value : m));
      return { ...team, members };
    });
    this.config.store.setTeams(updated);
  }

  public addTeamMember(teamIndex: number): void {
    if (this.checkDisposed()) {
      return;
    }
    const { teams } = this.config.store.getSnapshot();
    const updated = teams.map((team, index) =>
      index === teamIndex ? { ...team, members: [...team.members, ""] } : team,
    );
    this.config.store.setTeams(updated);
  }

  public removeTeamMember(teamIndex: number, memberIndex: number): void {
    if (this.checkDisposed()) {
      return;
    }
    const { teams } = this.config.store.getSnapshot();
    const updated = teams.map((team, tIdx) => {
      if (tIdx !== teamIndex) {
        return team;
      }
      const nextMembers = team.members.filter((_, mIdx) => mIdx !== memberIndex);
      return { ...team, members: nextMembers.length > 0 ? nextMembers : [""] };
    });
    this.config.store.setTeams(updated);
  }

  public toggleBackfillMatch(matchId: string): void {
    if (this.checkDisposed()) {
      return;
    }
    this.config.store.toggleBackfillMatch(matchId);
  }

  public discoverBackfillMatches(): void {
    if (this.checkDisposed()) {
      return;
    }
    void this.runBackfillDiscovery();
  }

  private async runBackfillDiscovery(): Promise<void> {
    const { teams } = this.config.store.getSnapshot();
    const memberNames = collectUniqueTeamMembers(teams);

    if (memberNames.length === 0) {
      this.config.store.setBackfillError("Add at least one player name before searching for shared custom games.");
      return;
    }

    this.config.store.setBackfillLoading();

    try {
      const resolvedPlayers = await Promise.all(
        memberNames.map(
          async (member): Promise<{ member: string; result: TrackerSearchResult | null }> => ({
            member,
            result: await this.config.individualTrackerService.searchGamertag(member),
          }),
        ),
      );

      if (this.checkDisposed()) {
        return;
      }

      const playersWithIdentity = resolvedPlayers.filter(
        (entry): entry is { member: string; result: TrackerSearchResult } => entry.result != null,
      );

      if (playersWithIdentity.length === 0) {
        this.config.store.setBackfillDone([], null, "No player identities were resolved. Check names and try again.");
        return;
      }

      const histories = await Promise.all(
        playersWithIdentity.map(async ({ member, result }) => ({
          member,
          matches: (
            await this.config.individualTrackerService.getMatchHistory(result.xuid, 0, 25, "custom")
          ).matches.filter((match) => match.category === "custom"),
        })),
      );

      if (this.checkDisposed()) {
        return;
      }

      const playersWithoutHistory = histories.filter((h) => h.matches.length === 0).map((h) => h.member);
      const { intersection, matchById } = computeMatchIntersection(histories);
      const candidates = sortCandidateMatches(intersection, matchById);

      const warning =
        playersWithoutHistory.length > 0
          ? `History unavailable for ${playersWithoutHistory.join(", ")}. Shared matches are based on players with available history.`
          : null;

      const error = candidates.length === 0 ? "No shared custom matches were found across the selected players." : null;

      this.config.store.setBackfillDone(candidates, warning, error);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to discover custom-game matches.";
      this.config.store.setBackfillError(message);
    }
  }

  public startSeries(): void {
    if (this.checkDisposed()) {
      return;
    }
    void this.runStartSeries();
  }

  private async runStartSeries(): Promise<void> {
    const snapshot = this.config.store.getSnapshot();
    this.config.store.setBusy(true);
    this.config.store.setSubmitError(null);

    try {
      const titleOverride = snapshot.titleOverride.trim() || null;
      const subtitleOverride = snapshot.subtitleOverride.trim() || null;
      const teams = snapshot.teams.map((team) => ({
        name: team.name.trim(),
        members: team.members.map((m) => m.trim()).filter((m) => m !== ""),
      }));

      await this.config.individualTrackerService.startSeries({
        trackerId: this.config.trackerId,
        titleOverride,
        subtitleOverride,
        teams,
        matchIds: [...snapshot.selectedBackfillMatchIds],
      });

      if (this.checkDisposed()) {
        return;
      }

      this.config.onSeriesStarted();
    } catch (err) {
      if (this.checkDisposed()) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to start series.";
      this.config.store.setSubmitError(message);
    } finally {
      if (!this.checkDisposed()) {
        this.config.store.setBusy(false);
      }
    }
  }
}
