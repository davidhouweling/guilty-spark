import { describe, expect, it, vi } from "vitest";
import type { Mock, MockInstance } from "vitest";
import type { SeriesDetailResponse } from "@guilty-spark/shared/contracts/stats/detail";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { aFakeSeriesDetailResponseWith } from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import {
  aFakeConfiguredTeamContextWith,
  aFakeSeriesMatchesServiceWith,
} from "../../../services/series-matches/fakes/series-matches.fake";
import { aFakeMatchAnalyticsServiceWith } from "../../../services/stats/fakes/match-analytics.fake";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import type { SeriesMatchesService } from "../../../services/series-matches/types";
import { SeriesAnalyticsController } from "../../series-analytics/series-analytics-controller";
import { SeriesDetailController } from "../series-detail-controller";
import type { SeriesDetailControllerConfig, SeriesDetailRequest } from "../types";

const request: SeriesDetailRequest = {
  seriesId: "series",
  matchIds: ["m-1", "m-2"],
  teamMappingMode: "substitution-aware",
};

function setup(): {
  controller: SeriesDetailController;
  onChange: Mock<SeriesDetailControllerConfig["onChange"]>;
  detail: MockInstance<SeriesMatchesService["getSeriesDetail"]>;
  analytics: MockInstance<MatchAnalyticsService["getBatchMatchAnalytics"]>;
  seriesMatchesService: SeriesMatchesService;
} {
  const seriesMatchesService = aFakeSeriesMatchesServiceWith();
  const matchAnalyticsService = aFakeMatchAnalyticsServiceWith();
  const onChange = vi.fn<SeriesDetailControllerConfig["onChange"]>();
  const controller = new SeriesDetailController({
    seriesMatchesService,
    trackerId: "tracker",
    createSeriesAnalyticsController: (callback): SeriesAnalyticsController =>
      new SeriesAnalyticsController({ matchAnalyticsService, trackerId: "tracker", onChange: callback }),
    onChange,
  });
  const detail = vi.spyOn(seriesMatchesService, "getSeriesDetail");
  const analytics = vi.spyOn(matchAnalyticsService, "getBatchMatchAnalytics");
  return { controller, onChange, detail, analytics, seriesMatchesService };
}

describe("SeriesDetailController", () => {
  it("deduplicates pending and loaded identities without raw requests or eager analytics", async () => {
    const { controller, detail, analytics, onChange, seriesMatchesService } = setup();
    const raw = vi.spyOn(seriesMatchesService, "getSeriesMatches");
    const matchDetails = vi.spyOn(seriesMatchesService, "getMatchDetails");
    controller.load(request);
    controller.load({ ...request, matchIds: [...request.matchIds] });
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        "series",
        expect.objectContaining({
          status: "loaded",
        }),
      );
    });
    controller.load(request);
    expect(detail).toHaveBeenCalledTimes(1);
    expect(detail).toHaveBeenCalledWith("series", ["m-1", "m-2"], "tracker", "substitution-aware");
    expect(raw).not.toHaveBeenCalled();
    expect(matchDetails).not.toHaveBeenCalled();
    expect(analytics).not.toHaveBeenCalled();
    controller.loadAnalytics("series", "scoreProgression", "m-2");
    controller.loadAnalytics("series", "scoreProgression", "m-2");
    expect(analytics).toHaveBeenCalledTimes(1);
    expect(analytics).toHaveBeenCalledWith(["m-2"], ["scoreProgression"], "tracker");
  });

  it("refreshes ordered membership, mapping and configured identities and snapshots mutable inputs", async () => {
    const { controller, detail, onChange } = setup();
    controller.load(request);
    controller.load({ ...request, matchIds: ["m-2", "m-1"] });
    controller.load({ ...request, teamMappingMode: "exact-roster" });
    const context = aFakeConfiguredTeamContextWith();
    const configured = { seriesId: "series", matchIds: ["m-1"], configuredTeamContext: context };
    controller.load(configured);
    context.teams[0].name = "Changed";
    controller.load(configured);
    expect(detail).toHaveBeenCalledTimes(5);
    expect(detail.mock.calls[3][4]?.teams[0].name).toBe("Configured one");
    expect(detail.mock.calls[4][4]?.teams[0].name).toBe("Changed");
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        "series",
        expect.objectContaining({
          status: "loaded",
        }),
      );
    });
    expect(onChange.mock.calls.filter(([, state]) => state.status === "loaded")).toHaveLength(1);
  });

  it("preserves unavailable totals and resolved matches, limiting analytics to available IDs", async () => {
    const { controller, detail, analytics, onChange } = setup();
    const data = aFakeSeriesDetailResponseWith({
      seriesId: "series",
      aggregation: {
        status: "unavailable",
        reason: "incomplete-matches",
      },
    });
    data.matches.results.unshift({ status: "unavailable", matchId: "missing", reason: "fetch-failed" });
    detail.mockResolvedValue(data);
    controller.load(request);
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith("series", {
        status: "loaded",
        data,
        analyticsByMatchId: new Map(),
      });
    });
    controller.loadAnalytics("series", "killMatrix");
    expect(analytics).toHaveBeenCalledWith(
      [
        ...new Set(
          data.matches.results.filter((result) => result.status === "resolved").map((result) => result.matchId),
        ),
      ],
      ["killMatrix"],
      "tracker",
    );
  });

  it("ignores replaced successes and failures, retries errors and supports explicit refresh", async () => {
    const { controller, detail, onChange } = setup();
    let resolve: ((data: SeriesDetailResponse) => void) | undefined;
    let reject: ((error: Error) => void) | undefined;
    detail.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    controller.load(request);
    detail.mockReturnValueOnce(
      new Promise((_done, fail) => {
        reject = fail;
      }),
    );
    controller.refresh(request);
    controller.refresh(request);
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        "series",
        expect.objectContaining({
          status: "loaded",
        }),
      );
    });
    const count = onChange.mock.calls.length;
    resolve?.(aFakeSeriesDetailResponseWith());
    reject?.(new Error("stale failure"));
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledTimes(count);
    detail.mockRejectedValueOnce(new Error("current failure"));
    controller.refresh(request);
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith("series", {
        status: "error",
        message: "current failure",
      });
    });
    controller.load(request);
    await vi.waitFor(() => {
      expect(onChange).toHaveBeenLastCalledWith(
        "series",
        expect.objectContaining({
          status: "loaded",
        }),
      );
    });
    expect(detail).toHaveBeenCalledTimes(5);
  });

  it("invalidates pending analytics and details without affecting another series and remains disposed", async () => {
    const { controller, detail, analytics, onChange } = setup();
    controller.load(request);
    controller.load({ ...request, seriesId: "other" });
    await vi.waitFor(() => {
      expect(onChange.mock.calls.filter(([, state]) => state.status === "loaded")).toHaveLength(2);
    });
    let resolveAnalytics: ((data: Record<string, MatchAnalytics | null>) => void) | undefined;
    analytics.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAnalytics = resolve;
      }),
    );
    controller.loadAnalytics("series", "killMatrix");
    controller.load({ ...request, matchIds: [] });
    const count = onChange.mock.calls.length;
    resolveAnalytics?.({});
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledTimes(count);
    controller.loadAnalytics("other", "killMatrix");
    expect(analytics).toHaveBeenCalledTimes(2);
    let resolveDetail: ((data: SeriesDetailResponse) => void) | undefined;
    detail.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDetail = resolve;
      }),
    );
    controller.load(request);
    controller.dispose();
    const disposedCount = onChange.mock.calls.length;
    resolveDetail?.(aFakeSeriesDetailResponseWith());
    controller.refresh(request);
    controller.loadAnalytics("other", "scoreProgression", "m-1");
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledTimes(disposedCount);
    expect(detail).toHaveBeenCalledTimes(3);
    expect(analytics).toHaveBeenCalledTimes(2);
  });
});
