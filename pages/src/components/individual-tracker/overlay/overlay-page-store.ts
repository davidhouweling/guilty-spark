import type { ViewerSeriesDetailsState } from "../viewer/types";
import type { MatchStatsState } from "./individual-tracker-overlay-presenter";

export interface OverlayPageSnapshot {
  readonly selectedMatchId: string | null;
  readonly selectedSeriesId: string | null;
  readonly matchStatsByMatchId: ReadonlyMap<string, MatchStatsState>;
  readonly seriesDetailsById: ReadonlyMap<string, ViewerSeriesDetailsState>;
}

export class OverlayPageStore {
  private snapshot: OverlayPageSnapshot = {
    selectedMatchId: null,
    selectedSeriesId: null,
    matchStatsByMatchId: new Map(),
    seriesDetailsById: new Map(),
  };

  private readonly subscribers = new Set<() => void>();

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): OverlayPageSnapshot {
    return this.snapshot;
  }

  public reset(): void {
    this.update({
      selectedMatchId: null,
      selectedSeriesId: null,
      matchStatsByMatchId: new Map(),
      seriesDetailsById: new Map(),
    });
  }

  public setSelectedMatchId(selectedMatchId: string | null): void {
    this.update({ selectedMatchId, selectedSeriesId: null });
  }

  public setSelectedSeriesId(selectedSeriesId: string | null): void {
    this.update({ selectedMatchId: null, selectedSeriesId });
  }

  public setMatchStatsState(matchId: string, state: MatchStatsState): void {
    const next = new Map(this.snapshot.matchStatsByMatchId);
    next.set(matchId, state);
    this.update({ matchStatsByMatchId: next });
  }

  public setSeriesDetailsState(seriesId: string, state: ViewerSeriesDetailsState): void {
    const next = new Map(this.snapshot.seriesDetailsById);
    next.set(seriesId, state);
    this.update({ seriesDetailsById: next });
  }

  public removeSeriesDetailsState(seriesId: string): void {
    const next = new Map(this.snapshot.seriesDetailsById);
    next.delete(seriesId);
    this.update({ seriesDetailsById: next });
  }

  private update(partial: Partial<OverlayPageSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
