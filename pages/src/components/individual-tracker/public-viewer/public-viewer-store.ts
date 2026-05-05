import type { PublicViewerSnapshot, PublicViewerVariant } from "./types";

function createInitialSnapshot(xuid: string, variant: PublicViewerVariant): PublicViewerSnapshot {
  return {
    xuid,
    variant,
    loading: true,
    availability: null,
    connectionStatus: "idle",
    errorMessage: null,
    trackerState: null,
    trackerSummary: null,
    matchHistory: null,
    matchHistoryLoading: false,
    renderModel: null,
    viewerTeamColor: "salmon",
    viewerEnemyColor: "cerulean",
  };
}

export class PublicViewerStore {
  public snapshot: PublicViewerSnapshot;
  public readonly subscribers = new Set<() => void>();

  public constructor(xuid: string, variant: PublicViewerVariant) {
    this.snapshot = createInitialSnapshot(xuid, variant);
  }
}
