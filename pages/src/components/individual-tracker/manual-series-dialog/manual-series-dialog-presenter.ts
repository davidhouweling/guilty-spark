import type { TrackerMatchSummary } from "@guilty-spark/shared/contracts/individual-tracker/view";
import {
  generateMapsFormatSchema,
  generateMapsPlaylistSchema,
  MAP_GENERATOR_COUNTS,
  MAP_GENERATOR_SLAYER_ONLY_PLAYLISTS,
} from "@guilty-spark/shared/contracts/individual-tracker/map-generation";
import { liveTrackerMapSchema } from "@guilty-spark/shared/contracts/durable-objects/live-tracker/maps";
import type { LiveTrackerMap } from "@guilty-spark/shared/contracts/durable-objects/live-tracker/maps";
import { getDurationBetween } from "@guilty-spark/shared/halo/duration";
import { getGameModeName } from "@guilty-spark/shared/halo/game-variants";
import type {
  GenerateMapsRequest,
  IndividualTrackerService,
  TrackerMatchHistoryEntry,
} from "../../../services/individual-tracker/types";
import type { IndividualTrackerViewService } from "../../../services/individual-tracker/view-types";
import { formatDisplayDateTime } from "../../../services/individual-tracker/match-history-helpers";
import type { ManualSeriesDialogStore } from "./manual-series-dialog-store";
import type { ManualSeriesDialogMapGeneratorOptions, PlannedMapRow } from "./types";

interface Config {
  readonly trackerId: string;
  readonly store: ManualSeriesDialogStore;
  readonly individualTrackerService: IndividualTrackerService;
  readonly individualTrackerViewService: IndividualTrackerViewService;
  readonly onSeriesStarted: () => void;
  readonly onSeriesEdited?: (() => void) | undefined;
}

function summaryToHistoryEntry({
  matchId,
  startTime,
  endTime,
  mapAssetId,
  mapVersionId,
  mapName,
  modeAssetId,
  gameVariantCategory,
  outcome,
  score,
  isMatchmaking,
}: TrackerMatchSummary): TrackerMatchHistoryEntry {
  return {
    matchId,
    startTime: formatDisplayDateTime(startTime),
    endTime: formatDisplayDateTime(endTime),
    mapAssetId,
    mapVersionId,
    modeAssetId,
    modeVersionId: "",
    gameVariantCategory,
    startTimeIso: startTime,
    endTimeIso: endTime,
    duration: getDurationBetween(startTime, endTime),
    mapName,
    modeName: getGameModeName(gameVariantCategory),
    outcome,
    resultString: score !== "" ? `${outcome} - ${score}` : outcome,
    isMatchmaking,
    category: isMatchmaking ? "matchmaking" : "custom",
    teams: [],
    mapThumbnailUrl: "data:,",
  };
}

export class ManualSeriesDialogPresenter {
  private readonly config: Config;
  private disposed = false;

  private readonly mapGeneratorOptions: ManualSeriesDialogMapGeneratorOptions = {
    playlistOptions: [
      { value: "C", label: "LVT Pro League - Current" },
      { value: "H", label: "HCS + LVT Pro League - Historical" },
      { value: "R", label: "Ranked Arena" },
      { value: "S", label: "Ranked Slayer" },
      { value: "N", label: "Ranked Snipers" },
      { value: "T", label: "Ranked Tactical" },
      { value: "D", label: "Ranked Doubles" },
      { value: "F", label: "Ranked FFA" },
      { value: "Q", label: "Ranked Squad Battle" },
    ],
    formatOptions: [
      { value: "H", label: "HCS" },
      { value: "R", label: "Random" },
      { value: "O", label: "Objective only" },
      { value: "S", label: "Slayer only" },
    ],
    counts: MAP_GENERATOR_COUNTS,
  };

  private readonly slayerOnlyPlaylists = new Set<string>(MAP_GENERATOR_SLAYER_ONLY_PLAYLISTS);

  public constructor(config: Config) {
    this.config = config;
  }

  public getMapGeneratorOptions(playlist: string): ManualSeriesDialogMapGeneratorOptions {
    if (this.slayerOnlyPlaylists.has(playlist)) {
      return {
        ...this.mapGeneratorOptions,
        formatOptions: this.mapGeneratorOptions.formatOptions.filter((option) => option.value === "S"),
      };
    }
    return this.mapGeneratorOptions;
  }

  public presentPlannedMaps(plannedMaps: readonly LiveTrackerMap[]): readonly PlannedMapRow[] {
    const rows: PlannedMapRow[] = [];
    for (const [index, map] of plannedMaps.entries()) {
      const gameLabel = `Game ${(index + 1).toString()}`;
      rows.push({
        index,
        gameLabel,
        removeLabel: `Remove ${gameLabel}: ${map.mode} on ${map.map}`,
        mode: map.mode,
        map: map.map,
      });
    }
    return rows;
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

  public setMapPlaylist(value: string): void {
    if (this.checkDisposed()) {
      return;
    }
    const result = generateMapsPlaylistSchema.safeParse(value);
    if (result.success) {
      const currentFormat = this.config.store.getSnapshot().mapFormat;
      const format = this.slayerOnlyPlaylists.has(result.data) ? "S" : currentFormat;
      this.config.store.setMapPlaylist(result.data, format);
    }
  }

  public setMapFormat(value: string): void {
    if (this.checkDisposed()) {
      return;
    }
    const result = generateMapsFormatSchema.safeParse(value);
    if (result.success) {
      this.config.store.setMapFormat(result.data);
    }
  }

  public setMapCount(value: number): void {
    if (this.checkDisposed()) {
      return;
    }
    this.config.store.setMapCount(value);
  }

  public removePlannedMap(index: number): void {
    if (this.checkDisposed()) {
      return;
    }
    this.config.store.removePlannedMap(index);
  }

  public setPlannedMapMode(index: number, mode: string): void {
    if (this.checkDisposed()) {
      return;
    }
    this.config.store.setPlannedMapMode(index, mode);
  }

  public setPlannedMapName(index: number, mapName: string): void {
    if (this.checkDisposed()) {
      return;
    }
    this.config.store.setPlannedMapName(index, mapName);
  }

  public generateMaps(): void {
    if (this.checkDisposed()) {
      return;
    }
    void this.generateMapsAsync();
  }

  private async generateMapsAsync(): Promise<void> {
    const snapshot = this.config.store.getSnapshot();
    this.config.store.setMapGenerationLoading();
    try {
      const maps = await this.config.individualTrackerService.generateMaps({
        trackerId: this.config.trackerId,
        playlist: snapshot.mapPlaylist,
        format: snapshot.mapFormat,
        count: snapshot.mapCount,
      } satisfies GenerateMapsRequest);
      if (this.checkDisposed()) {
        return;
      }
      this.config.store.setPlannedMaps(maps);
    } catch (error) {
      if (this.checkDisposed()) {
        return;
      }
      this.config.store.setMapGenerationError(error instanceof Error ? error.message : "Failed to generate maps.");
    }
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
    const plannedMapsResult = liveTrackerMapSchema.array().safeParse(snapshot.plannedMaps);
    if (!plannedMapsResult.success) {
      this.config.store.setSubmitError("Each planned game must have a valid mode and map.");
      return;
    }
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
        ...(plannedMapsResult.data.length > 0 ? { plannedMaps: plannedMapsResult.data } : {}),
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
