import { afterEach, describe, expect, it, vi } from "vitest";
import type { OverlayPreviewResponse } from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { aFakeOverlayPreviewServiceWith } from "../../../services/individual-tracker/fakes/overlay-preview.fake";
import { CapabilityPreviewPresenter } from "../capability-preview-presenter";
import { CapabilityPreviewStore } from "../capability-preview-store";

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

  it("can reload after effect cleanup", async () => {
    const { presenter, store } = createHarness();
    presenter.dispose();

    presenter.load("matchmaking");

    await vi.waitFor(() => {
      expect(store.getSnapshot().matchmaking.status).toBe("loaded");
    });
  });

  it("forwards local preview settings to the endpoint", async () => {
    const { presenter, store, previewService } = createHarness();
    const getPreview = vi.spyOn(previewService, "getPreview");
    const previewSettings: StreamerViewSettings = {
      visibleSections: { statsHighlightSlots: ["kda", "total-games"] },
    };

    presenter.load("matchmaking", previewSettings);

    await vi.waitFor(() => {
      expect(store.getSnapshot().matchmaking.status).toBe("loaded");
    });
    expect(getPreview).toHaveBeenCalledWith("matchmaking", previewSettings);
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
