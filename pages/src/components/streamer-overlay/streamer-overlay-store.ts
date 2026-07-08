export interface StreamerOverlaySnapshot {
  readonly selectedTab: number;
  readonly internalIsPanelOpen: boolean;
  readonly currentMatchIndex: number;
  readonly previousMatchCount: number;
}

export class StreamerOverlayStore {
  private snapshot: StreamerOverlaySnapshot = {
    selectedTab: -1,
    internalIsPanelOpen: false,
    currentMatchIndex: 0,
    previousMatchCount: 0,
  };

  private readonly subscribers = new Set<() => void>();

  public subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return (): void => {
      this.subscribers.delete(listener);
    };
  }

  public getSnapshot(): StreamerOverlaySnapshot {
    return this.snapshot;
  }

  public setSelectedTab(selectedTab: number): void {
    this.update({ selectedTab });
  }

  public setInternalIsPanelOpen(internalIsPanelOpen: boolean): void {
    this.update({ internalIsPanelOpen });
  }

  public setCurrentMatchIndex(currentMatchIndex: number): void {
    this.update({ currentMatchIndex });
  }

  public setPreviousMatchCount(previousMatchCount: number): void {
    this.update({ previousMatchCount });
  }

  public batchUpdate(partial: Partial<StreamerOverlaySnapshot>): void {
    this.update(partial);
  }

  private update(partial: Partial<StreamerOverlaySnapshot>): void {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}
