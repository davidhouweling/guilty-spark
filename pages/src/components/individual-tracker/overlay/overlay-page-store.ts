import type { MatchStatsState } from "./individual-tracker-overlay-presenter";

export interface OverlayPageSnapshot {
  readonly selectedMatchId: string | null;
  readonly matchStatsByMatchId: ReadonlyMap<string, MatchStatsState>;
}

export class OverlayPageStore {
  private snapshot: OverlayPageSnapshot = {
    selectedMatchId: null,
    matchStatsByMatchId: new Map(),
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
      matchStatsByMatchId: new Map(),
    });
  }

  public setSelectedMatchId(selectedMatchId: string | null): void {
    this.update({ selectedMatchId });
  }

  public setMatchStatsState(matchId: string, state: MatchStatsState): void {
    const next = new Map(this.snapshot.matchStatsByMatchId);
    next.set(matchId, state);
    this.update({ matchStatsByMatchId: next });
  }

  private update(partial: Partial<OverlayPageSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
