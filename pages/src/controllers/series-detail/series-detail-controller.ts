import type { AnalyticsModule } from "@guilty-spark/shared/contracts/stats/match-analytics";
import type { SeriesAnalyticsController } from "../series-analytics/series-analytics-controller";
import type { SeriesDetailControllerConfig, SeriesDetailRequest } from "./types";

interface SeriesSource {
  readonly identity: string;
  status: "loading" | "loaded" | "error";
  analytics: SeriesAnalyticsController | null;
}

// Per-tracker, per-mount ownership; ordered membership and mapping configuration define each series source.
export class SeriesDetailController {
  private readonly sources = new Map<string, SeriesSource>();
  private isDisposed = false;

  constructor(private readonly config: SeriesDetailControllerConfig) {}

  load(request: SeriesDetailRequest): void {
    if (this.isDisposed) {
      return;
    }
    if (request.matchIds.length === 0) {
      this.invalidate(request.seriesId);
      return;
    }
    const snapshot: SeriesDetailRequest = {
      seriesId: request.seriesId,
      matchIds: [...request.matchIds],
      teamMappingMode: request.teamMappingMode,
      configuredTeamContext:
        request.configuredTeamContext == null ? undefined : structuredClone(request.configuredTeamContext),
    };
    const identity = JSON.stringify(snapshot);
    const current = this.sources.get(request.seriesId);
    if (current?.identity === identity && current.status !== "error") {
      return;
    }
    this.invalidate(request.seriesId);
    const source: SeriesSource = { identity, status: "loading", analytics: null };
    this.sources.set(request.seriesId, source);
    this.config.onChange(request.seriesId, { status: "loading" });
    void this.loadAsync(snapshot, source);
  }

  loadAnalytics(seriesId: string, module: AnalyticsModule, matchId?: string): void {
    this.sources.get(seriesId)?.analytics?.load(module, matchId);
  }

  refresh(request: SeriesDetailRequest): void {
    this.invalidate(request.seriesId);
    this.load(request);
  }

  // Invalidating drops ownership; callers decide whether to clear their displayed state.
  invalidate(seriesId: string): void {
    this.sources.get(seriesId)?.analytics?.dispose();
    this.sources.delete(seriesId);
  }

  reset(): void {
    for (const seriesId of this.sources.keys()) {
      this.invalidate(seriesId);
    }
  }

  dispose(): void {
    this.isDisposed = true;
    this.reset();
  }

  private isCurrent(seriesId: string, source: SeriesSource): boolean {
    return !this.isDisposed && this.sources.get(seriesId) === source;
  }

  private async loadAsync(request: SeriesDetailRequest, source: SeriesSource): Promise<void> {
    const { seriesId, matchIds, teamMappingMode, configuredTeamContext } = request;
    try {
      const data =
        configuredTeamContext == null
          ? await this.config.seriesMatchesService.getSeriesDetail(
              seriesId,
              matchIds,
              this.config.trackerId,
              teamMappingMode,
            )
          : await this.config.seriesMatchesService.getSeriesDetail(
              seriesId,
              matchIds,
              this.config.trackerId,
              teamMappingMode,
              configuredTeamContext,
            );
      if (!this.isCurrent(seriesId, source)) {
        return;
      }
      source.status = "loaded";
      source.analytics = this.config.createSeriesAnalyticsController((analyticsByMatchId) => {
        if (this.isCurrent(seriesId, source)) {
          this.config.onChange(seriesId, { status: "loaded", data, analyticsByMatchId });
        }
      });
      source.analytics.reset(
        data.matches.results.filter((result) => result.status === "resolved").map((result) => result.matchId),
      );
    } catch (error) {
      if (this.isCurrent(seriesId, source)) {
        source.status = "error";
        this.config.onChange(seriesId, {
          status: "error",
          message: error instanceof Error ? error.message : "Failed to load series",
        });
      }
    }
  }
}
