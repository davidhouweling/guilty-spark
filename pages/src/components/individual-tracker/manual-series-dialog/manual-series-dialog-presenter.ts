import type { TrackerMatchSummary } from "@guilty-spark/shared/contracts/individual-tracker/view";
import { getDurationBetween } from "@guilty-spark/shared/halo/duration";
import type { IndividualTrackerService, TrackerMatchHistoryEntry } from "../../../services/individual-tracker/types";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import { formatDisplayDateTime } from "../../../services/individual-tracker/match-history-helpers";
import type { ManualSeriesDialogStore } from "./manual-series-dialog-store";

interface Config {
  readonly trackerId: string;
  readonly store: ManualSeriesDialogStore;
  readonly individualTrackerService: IndividualTrackerService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly onSeriesStarted: () => void;
  readonly onSeriesEdited?: (() => void) | undefined;
}

function summaryToHistoryEntry(summary: TrackerMatchSummary): TrackerMatchHistoryEntry {
  const outcome = (
    ["Win", "Loss", "Tie", "DNF"].includes(summary.outcome) ? summary.outcome : "Unknown"
  ) as TrackerMatchHistoryEntry["outcome"];
  return {
    matchId: summary.matchId,
    startTime: formatDisplayDateTime(summary.startTime),
    endTime: formatDisplayDateTime(summary.endTime),
    mapAssetId: summary.mapAssetId,
    mapVersionId: summary.mapVersionId,
    modeAssetId: summary.modeAssetId,
    modeVersionId: "",
    gameVariantCategory: summary.gameVariantCategory,
    startTimeIso: summary.startTime,
    endTimeIso: summary.endTime,
    duration: getDurationBetween(summary.startTime, summary.endTime),
    mapName: summary.mapName,
    modeName: "Custom",
    outcome,
    resultString: summary.score !== "" ? `${outcome} - ${summary.score}` : outcome,
    isMatchmaking: summary.isMatchmaking,
    category: summary.isMatchmaking ? "matchmaking" : "custom",
    teams: [],
    mapThumbnailUrl: "data:,",
  };
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
    this.config.store.setBackfillLoading();
    try {
      const { view } = await this.config.individualTrackerViewService.getView(this.config.trackerId);
      if (this.checkDisposed()) {
        return;
      }
      const entries = view.matches
        .filter((m) => !m.isMatchmaking)
        .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
        .map(summaryToHistoryEntry);
      const error = entries.length === 0 ? "No custom game matches found for this tracker yet." : null;
      this.config.store.setBackfillDone(entries, null, error);
    } catch (err) {
      if (this.checkDisposed()) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to load tracker matches.";
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

  public editSeries(): void {
    if (this.checkDisposed()) {
      return;
    }
    void this.runEditSeries();
  }

  private async runEditSeries(): Promise<void> {
    const snapshot = this.config.store.getSnapshot();
    this.config.store.setBusy(true);
    this.config.store.setSubmitError(null);

    try {
      const teams = snapshot.teams.map((team) => ({
        name: team.name.trim(),
        members: team.members.map((m) => m.trim()).filter((m) => m !== ""),
      }));
      const hasTeamData = teams.some((t) => t.name !== "" || t.members.length > 0);

      await this.config.individualTrackerService.editSeries(this.config.trackerId, {
        titleOverride: snapshot.titleOverride.trim() || null,
        subtitleOverride: snapshot.subtitleOverride.trim() || null,
        ...(hasTeamData || snapshot.hadInitialTeams ? { teams } : {}),
      });

      if (this.checkDisposed()) {
        return;
      }

      this.config.onSeriesEdited?.();
    } catch (err) {
      if (this.checkDisposed()) {
        return;
      }
      const message = err instanceof Error ? err.message : "Failed to edit series.";
      this.config.store.setSubmitError(message);
    } finally {
      if (!this.checkDisposed()) {
        this.config.store.setBusy(false);
      }
    }
  }
}
