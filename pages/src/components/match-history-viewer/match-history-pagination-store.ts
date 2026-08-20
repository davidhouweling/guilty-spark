export interface MatchHistoryPaginationSnapshot {
  readonly hasMore: boolean;
  readonly loadingMore: boolean;
}

export class MatchHistoryPaginationStore {
  private snapshot: MatchHistoryPaginationSnapshot = { hasMore: false, loadingMore: false };
  private readonly subscribers = new Set<() => void>();

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): MatchHistoryPaginationSnapshot {
    return this.snapshot;
  }

  public update(partial: Partial<MatchHistoryPaginationSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
