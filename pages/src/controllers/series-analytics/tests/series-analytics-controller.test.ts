import { describe, expect, it, vi } from "vitest";
import type { Mock, MockInstance } from "vitest";
import type { MatchAnalytics } from "@guilty-spark/shared/contracts/stats/match-analytics";
import { ComponentLoaderStatus } from "../../../components/component-loader/component-loader";
import type { SeriesMatchAnalyticsById } from "../../../components/series-stats/types";
import {
  aFakeCtfMatchAnalyticsWith,
  aFakeMatchAnalyticsServiceWith,
} from "../../../services/stats/fakes/match-analytics.fake";
import type { MatchAnalyticsService } from "../../../services/stats/match-analytics-types";
import { SeriesAnalyticsController } from "../series-analytics-controller";

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => {
    throw new Error("Promise resolver unavailable");
  };
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup(trackerId?: string): {
  controller: SeriesAnalyticsController;
  request: MockInstance<MatchAnalyticsService["getBatchMatchAnalytics"]>;
  onChange: Mock<(value: SeriesMatchAnalyticsById) => void>;
  snapshot: () => SeriesMatchAnalyticsById;
} {
  const service: MatchAnalyticsService = aFakeMatchAnalyticsServiceWith();
  const request = vi.spyOn(service, "getBatchMatchAnalytics");
  let snapshot: SeriesMatchAnalyticsById = new Map();
  const onChange = vi.fn<(value: SeriesMatchAnalyticsById) => void>((value) => {
    snapshot = value;
  });
  const controller = new SeriesAnalyticsController({ matchAnalyticsService: service, trackerId, onChange });
  return { controller, request, onChange, snapshot: (): SeriesMatchAnalyticsById => snapshot };
}

describe("SeriesAnalyticsController", () => {
  it("loads sequential batches and retries only failed or missing records", async () => {
    const { controller, request, snapshot } = setup("tracker");
    const ids = Array.from({ length: 61 }, (_, index) => `match-${index.toString()}`);
    const first = deferred<Record<string, MatchAnalytics | null>>();
    const analytics = aFakeCtfMatchAnalyticsWith();
    request.mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error("failed"));
    controller.reset([...ids, "match-0"]);
    controller.load("killMatrix");
    controller.load("killMatrix");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(ids.slice(0, 30), ["killMatrix"], "tracker");
    const loading = snapshot();
    first.resolve(Object.fromEntries(ids.slice(0, 30).map((id) => [id, id === "match-1" ? null : analytics])));
    await vi.waitFor(() => {
      expect(snapshot().get("match-60")?.killMatrix?.status).toBe(ComponentLoaderStatus.ERROR);
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(snapshot().get("match-0")?.killMatrix?.status).toBe(ComponentLoaderStatus.LOADED);
    expect(snapshot().get("match-1")?.killMatrix?.status).toBe(ComponentLoaderStatus.ERROR);
    expect(loading.get("match-0")?.killMatrix?.status).toBe(ComponentLoaderStatus.LOADING);
    request.mockResolvedValueOnce({});
    controller.load("killMatrix");
    expect(request).toHaveBeenLastCalledWith(["match-1", ...ids.slice(30, 59)], ["killMatrix"], "tracker");
    await vi.waitFor(() => {
      expect(snapshot().get("match-60")?.killMatrix?.status).toBe(ComponentLoaderStatus.LOADED);
    });
    expect(snapshot().get("match-1")?.killMatrix?.status).toBe(ComponentLoaderStatus.ERROR);
  });

  it("deduplicates implied matrix and preserves independent success when timeline fails", async () => {
    const { controller, request, snapshot } = setup();
    const pending = deferred<Record<string, MatchAnalytics | null>>();
    const analytics = aFakeCtfMatchAnalyticsWith({ scoreProgression: null });
    request.mockReturnValueOnce(pending.promise);
    controller.reset(["a", "b"]);
    controller.load("scoreProgression", "a");
    controller.load("killMatrix");
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenLastCalledWith(["b"], ["killMatrix"]);
    pending.resolve({ a: analytics });
    await vi.waitFor(() => {
      expect(snapshot().get("a")?.scoreProgression?.status).toBe(ComponentLoaderStatus.LOADED);
    });
    expect(snapshot().get("a")).toEqual({
      scoreProgression: { status: ComponentLoaderStatus.LOADED, data: null },
      killMatrix: { status: ComponentLoaderStatus.LOADED, data: analytics.killMatrix },
    });
    controller.load("killMatrix", "a");
    controller.load("scoreProgression", "a");
    expect(request).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => {
      expect(snapshot().get("b")?.killMatrix?.status).toBe(ComponentLoaderStatus.LOADED);
    });
    request.mockRejectedValueOnce(new Error("failed"));
    controller.load("scoreProgression", "b");
    await vi.waitFor(() => {
      expect(snapshot().get("b")?.scoreProgression?.status).toBe(ComponentLoaderStatus.ERROR);
    });
    expect(snapshot().get("b")?.killMatrix?.status).toBe(ComponentLoaderStatus.LOADED);
  });

  it("preserves loaded and in-flight modules when live matches are appended", async () => {
    const { controller, request, snapshot } = setup();
    controller.reset(["a", "b"]);
    controller.load("killMatrix", "a");
    await vi.waitFor(() => {
      expect(snapshot().get("a")?.killMatrix?.status).toBe(ComponentLoaderStatus.LOADED);
    });
    const loaded = snapshot().get("a");
    const pending = deferred<Record<string, MatchAnalytics | null>>();
    request.mockReturnValueOnce(pending.promise);
    controller.load("scoreProgression", "b");
    const loading = snapshot().get("b");
    controller.updateMatchIds(["a", "b", "c", "c"]);
    controller.load("scoreProgression", "b");
    controller.load("killMatrix");
    expect(request).toHaveBeenCalledTimes(3);
    expect(request).toHaveBeenLastCalledWith(["c"], ["killMatrix"]);
    expect(snapshot().get("a")).toBe(loaded);
    expect(snapshot().get("b")).toBe(loading);
    pending.resolve({ b: aFakeCtfMatchAnalyticsWith() });
    await vi.waitFor(() => {
      expect(snapshot().get("b")?.scoreProgression?.status).toBe(ComponentLoaderStatus.LOADED);
    });
    expect(snapshot().get("b")?.killMatrix?.status).toBe(ComponentLoaderStatus.LOADED);
  });

  it("prunes removed matches and skips their queued analytics requests", async () => {
    const { controller, request, snapshot } = setup();
    const ids = Array.from({ length: 61 }, (_, index) => `match-${index.toString()}`);
    const pending = deferred<Record<string, MatchAnalytics | null>>();
    request.mockReturnValueOnce(pending.promise);
    controller.reset(ids);
    controller.load("killMatrix");
    controller.updateMatchIds(["match-0", "match-30"]);
    pending.resolve(Object.fromEntries(ids.map((id) => [id, aFakeCtfMatchAnalyticsWith()])));
    await vi.waitFor(() => {
      expect(snapshot().get("match-30")?.killMatrix?.status).toBe(ComponentLoaderStatus.LOADED);
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenLastCalledWith(["match-30"], ["killMatrix"]);
    expect([...snapshot().keys()]).toEqual(["match-0", "match-30"]);
  });

  it("does not apply an obsolete result when a removed match is requested again", async () => {
    const { controller, request, onChange, snapshot } = setup();
    const obsolete = deferred<Record<string, MatchAnalytics | null>>();
    const current = deferred<Record<string, MatchAnalytics | null>>();
    request.mockReturnValueOnce(obsolete.promise).mockReturnValueOnce(current.promise);
    controller.reset(["a"]);
    controller.load("killMatrix");
    controller.updateMatchIds([]);
    controller.updateMatchIds(["a"]);
    controller.load("killMatrix");
    const notifications = onChange.mock.calls.length;
    obsolete.resolve({ a: null });
    await obsolete.promise;
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledTimes(notifications);
    expect(snapshot().get("a")?.killMatrix?.status).toBe(ComponentLoaderStatus.LOADING);
    current.resolve({ a: aFakeCtfMatchAnalyticsWith() });
    await vi.waitFor(() => {
      expect(snapshot().get("a")?.killMatrix?.status).toBe(ComponentLoaderStatus.LOADED);
    });
  });

  it.each(["reset", "dispose"] as const)("ignores late results after %s", async (action) => {
    const { controller, request, onChange, snapshot } = setup();
    const pending = deferred<Record<string, MatchAnalytics | null>>();
    request.mockReturnValueOnce(pending.promise);
    controller.reset(["a"]);
    controller.load("killMatrix");
    if (action === "reset") {
      controller.reset(["b"]);
    } else {
      controller.dispose();
    }
    const before = snapshot();
    const calls = onChange.mock.calls.length;
    pending.resolve({ a: aFakeCtfMatchAnalyticsWith() });
    await pending.promise;
    await Promise.resolve();
    expect(onChange).toHaveBeenCalledTimes(calls);
    expect(snapshot()).toBe(before);
  });
});
