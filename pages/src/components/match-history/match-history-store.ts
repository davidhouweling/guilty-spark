export interface MatchHistorySnapshot {
  readonly isLoadingMore: boolean;
}

export class MatchHistoryStore {
  private snapshot: MatchHistorySnapshot;
  private readonly subscribers = new Set<() => void>();

  public constructor() {
    this.snapshot = { isLoadingMore: false };
  }

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): MatchHistorySnapshot {
    return this.snapshot;
  }

  public update(partial: Partial<MatchHistorySnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
