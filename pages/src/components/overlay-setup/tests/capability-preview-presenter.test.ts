import { afterEach, describe, expect, it, vi } from "vitest";
import type { OverlayPreviewResponse } from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { aFakeOverlayPreviewServiceWith } from "../../../services/individual-tracker/fakes/overlay-preview.fake";
import { CapabilityPreviewPresenter } from "../capability-preview-presenter";
import { CapabilityPreviewStore } from "../capability-preview-store";

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value): void => {
      if (resolvePromise === undefined) {
        throw new Error("Deferred promise resolver was not initialized");
      }
      resolvePromise(value);
    },
  };
}

function createHarness(): {
  readonly presenter: CapabilityPreviewPresenter;
  readonly store: CapabilityPreviewStore;
  readonly previewService: ReturnType<typeof aFakeOverlayPreviewServiceWith>;
} {
  const store = new CapabilityPreviewStore();
  const previewService = aFakeOverlayPreviewServiceWith();
  const presenter = new CapabilityPreviewPresenter({
    previewService,
    store,
  });
  return { presenter, store, previewService };
}

describe("CapabilityPreviewPresenter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads matchmaking and series endpoint views independently", async () => {
    const { presenter, store } = createHarness();

    presenter.load("matchmaking");
    presenter.load("series");
    await vi.waitFor(() => {
      expect(store.getSnapshot().matchmaking.status).toBe("loaded");
      expect(store.getSnapshot().series.status).toBe("loaded");
    });

    const { matchmaking, series } = store.getSnapshot();
    expect(matchmaking.status).toBe("loaded");
    expect(series.status).toBe("loaded");
    if (matchmaking.status !== "loaded" || series.status !== "loaded") {
      throw new Error("Expected both preview modes to load");
    }
    expect(matchmaking.data.view.hasActiveSeries).toBe(false);
    expect(series.data.view.hasActiveSeries).toBe(true);
    expect(matchmaking.data.mode).toBe("matchmaking");
    expect(series.data.mode).toBe("series");
  });

  it("ignores a stale request after effect cleanup and restart", async () => {
    const { presenter, store, previewService } = createHarness();
    const firstResponse = await previewService.getPreview("matchmaking");
    const secondResponse: OverlayPreviewResponse = {
      ...firstResponse,
      view: { ...firstResponse.view, gamertag: "Restarted Spartan" },
    };
    const firstRequest = createDeferred<OverlayPreviewResponse>();
    const secondRequest = createDeferred<OverlayPreviewResponse>();
    vi.spyOn(previewService, "getPreview")
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);

    presenter.load("matchmaking");
    presenter.dispose();
    presenter.load("matchmaking");
    secondRequest.resolve(secondResponse);

    await vi.waitFor(() => {
      expect(store.getSnapshot().matchmaking.status).toBe("loaded");
    });
    firstRequest.resolve(firstResponse);
    await Promise.resolve();

    const { matchmaking } = store.getSnapshot();
    expect(matchmaking.status).toBe("loaded");
    if (matchmaking.status !== "loaded") {
      throw new Error("Expected restarted preview request to load");
    }
    expect(matchmaking.data.view.gamertag).toBe("Restarted Spartan");
  });

  it("forwards local preview settings and preserves their fake preview output", async () => {
    const { presenter, store, previewService } = createHarness();
    const getPreview = vi.spyOn(previewService, "getPreview");
    const previewSettings: StreamerViewSettings = {
      styleFlags: { colorMode: "observer" },
      visibleSections: {
        statsHighlightSlots: [
          "kills",
          "total-games",
          "kda",
          "deaths",
          "assists",
          "accuracy",
          "damage-dealt",
          "damage-taken",
          "avg-life-time",
        ],
      },
    };

    presenter.load("matchmaking", previewSettings);

    await vi.waitFor(() => {
      expect(store.getSnapshot().matchmaking.status).toBe("loaded");
    });
    expect(getPreview).toHaveBeenCalledWith("matchmaking", previewSettings);
    const { matchmaking } = store.getSnapshot();
    expect(matchmaking.status).toBe("loaded");
    if (matchmaking.status !== "loaded") {
      throw new Error("Expected matchmaking preview to load");
    }
    expect(matchmaking.data.view.streamerSettings).toEqual(previewSettings);
    expect(matchmaking.data.view.statsHighlights).toEqual([
      { label: "Kills", value: "N/A" },
      { label: "Total Games", value: "13" },
      { label: "KDA", value: "1.72" },
      { label: "Deaths", value: "N/A" },
      { label: "Assists", value: "N/A" },
      { label: "Accuracy", value: "N/A" },
      { label: "Damage Dealt", value: "N/A" },
      { label: "Damage Taken", value: "N/A" },
    ]);
  });

  it("records an endpoint error for only the mode that failed", async () => {
    const { presenter, store, previewService } = createHarness();
    const baseResponse = await previewService.getPreview("matchmaking");
    vi.spyOn(previewService, "getPreview").mockImplementation(async (mode): Promise<OverlayPreviewResponse> => {
      if (mode === "series") {
        throw new Error("Series preview unavailable");
      }
      return Promise.resolve({ ...baseResponse, mode });
    });

    presenter.load("matchmaking");
    presenter.load("series");
    await vi.waitFor(() => {
      expect(store.getSnapshot().matchmaking.status).toBe("loaded");
      expect(store.getSnapshot().series.status).toBe("error");
    });

    expect(store.getSnapshot().series.errorMessage).toBe("Series preview unavailable");
  });
});
