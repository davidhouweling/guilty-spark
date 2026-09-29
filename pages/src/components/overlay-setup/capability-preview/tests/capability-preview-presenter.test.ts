import { afterEach, describe, expect, it, vi } from "vitest";
import type { OverlayPreviewResponse } from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import type { TrackerDirectory } from "@guilty-spark/shared/contracts/individual-tracker/follow";
import { aDirectoryWith } from "@guilty-spark/shared/contracts/individual-tracker/fakes/follow.fake";
import type { StreamerViewSettings } from "@guilty-spark/shared/individual-tracker/streamer-view-settings";
import { aFakeFollowLiveServiceWith } from "../../../../services/follow/fakes/follow.fake";
import { aFakeOverlayPreviewServiceWith } from "../../../../services/individual-tracker/fakes/overlay-preview.fake";
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
  readonly followLiveService: ReturnType<typeof aFakeFollowLiveServiceWith>;
} {
  const store = new CapabilityPreviewStore();
  const previewService = aFakeOverlayPreviewServiceWith();
  const followLiveService = aFakeFollowLiveServiceWith();
  const presenter = new CapabilityPreviewPresenter({
    previewService,
    followLiveService,
    store,
  });
  return { presenter, store, previewService, followLiveService };
}

describe("CapabilityPreviewPresenter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the authenticated directory without issuing preview requests", async () => {
    const { presenter, store, previewService, followLiveService } = createHarness();
    const getDirectory = vi.spyOn(followLiveService, "getDirectory");
    const getPreview = vi.spyOn(previewService, "getPreview");

    presenter.loadLiveDirectory("Spartan One");
    await vi.waitFor(() => {
      expect(store.getSnapshot().liveDirectory.status).toBe("loaded");
    });

    expect(getDirectory).toHaveBeenCalledWith("Spartan One");
    expect(getPreview).not.toHaveBeenCalled();
  });

  it("applies newer follow-directory updates and clears them on sign-out", () => {
    const { presenter, store } = createHarness();
    const directory = aDirectoryWith();

    presenter.onFollowDirectoryChange(directory);
    expect(store.getSnapshot().liveDirectory.data?.liveTrackerId).toBe("tracker-1");

    presenter.clearLiveDirectory();
    expect(store.getSnapshot().liveDirectory).toEqual({ status: "idle", data: null, errorMessage: null });
  });

  it("ignores a stale directory response after clearing the identity", async () => {
    const { presenter, store, followLiveService } = createHarness();
    const request = createDeferred<TrackerDirectory>();
    vi.spyOn(followLiveService, "getDirectory").mockReturnValueOnce(request.promise);

    presenter.loadLiveDirectory("Spartan One");
    presenter.clearLiveDirectory();
    request.resolve(aDirectoryWith());
    await Promise.resolve();

    expect(store.getSnapshot().liveDirectory.status).toBe("idle");
    expect(store.getSnapshot().liveDirectory.data).toBeNull();
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

  it("preserves server settings when presenting without a local override", async () => {
    const { presenter, store } = createHarness();
    const serverSettings: StreamerViewSettings = {
      styleFlags: { colorMode: "observer", matchmakingShowTicker: false },
    };
    const response = await aFakeOverlayPreviewServiceWith().getPreview("matchmaking");
    store.setLoaded("matchmaking", {
      ...response,
      view: { ...response.view, streamerSettings: serverSettings },
    });

    const viewModel = presenter.present(store.getSnapshot(), {
      gamertag: null,
      isAuthenticated: true,
      previewMode: "player",
      streamerSettings: undefined,
    });

    expect(viewModel.content.type).toBe("overlay");
    if (viewModel.content.type !== "overlay") {
      throw new Error("Expected a matchmaking overlay preview");
    }
    expect(viewModel.content.view.streamerSettings).toEqual(serverSettings);
  });

  it("stores the selected tab and presents its matching preview state", async () => {
    const { presenter, store, previewService } = createHarness();
    const seriesResponse = await previewService.getPreview("series");
    store.setLoaded("series", seriesResponse);
    presenter.selectTab("series");

    const viewModel = presenter.present(store.getSnapshot(), {
      gamertag: null,
      isAuthenticated: false,
      previewMode: "observer",
      streamerSettings: undefined,
    });

    expect(store.getSnapshot().activeTab).toBe("series");
    expect(viewModel.activeTab).toBe("series");
    expect(viewModel.source).toEqual({ isExample: true, gamertag: "soundmanD" });
    expect(viewModel.content.type).toBe("overlay");
    if (viewModel.content.type !== "overlay") {
      throw new Error("Expected a series overlay preview");
    }
    expect(viewModel.content.mode).toBe("series");
  });

  it("shows the demo identity before the preview response loads", () => {
    const { presenter, store } = createHarness();
    const viewModel = presenter.present(store.getSnapshot(), {
      gamertag: "343GuiltySpark",
      isAuthenticated: false,
      previewMode: "player",
      streamerSettings: undefined,
    });

    expect(viewModel.source).toEqual({ isExample: true, gamertag: "soundmanD" });
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

  it("loads matchmaking initially and keeps series lazy until requested", async () => {
    const { presenter, store, previewService } = createHarness();
    const getPreview = vi.spyOn(previewService, "getPreview");

    presenter.updateSettings();

    await vi.waitFor(() => {
      expect(store.getSnapshot().matchmaking.status).toBe("loaded");
    });
    expect(store.getSnapshot().series.status).toBe("idle");
    expect(getPreview).toHaveBeenCalledTimes(1);
    expect(getPreview).toHaveBeenCalledWith("matchmaking", undefined);

    presenter.load("series");
    await vi.waitFor(() => {
      expect(store.getSnapshot().series.status).toBe("loaded");
    });
    expect(getPreview).toHaveBeenCalledTimes(2);
    expect(getPreview).toHaveBeenLastCalledWith("series", undefined);
  });

  it("refreshes only matchmaking when highlight slots change", async () => {
    const { presenter, store, previewService } = createHarness();
    const getPreview = vi.spyOn(previewService, "getPreview");
    const initialSettings: StreamerViewSettings = {
      styleFlags: { colorMode: "player" },
      visibleSections: { statsHighlightSlots: ["kda"] },
    };
    const updatedSettings: StreamerViewSettings = {
      styleFlags: { colorMode: "observer" },
      visibleSections: { statsHighlightSlots: ["esra"] },
    };

    presenter.updateSettings(initialSettings);
    presenter.load("series", initialSettings);
    await vi.waitFor(() => {
      expect(store.getSnapshot().matchmaking.status).toBe("loaded");
      expect(store.getSnapshot().series.status).toBe("loaded");
    });

    presenter.updateSettings(updatedSettings);

    await vi.waitFor(() => {
      expect(store.getSnapshot().matchmaking.status).toBe("loaded");
    });
    expect(store.getSnapshot().series.status).toBe("loaded");
    expect(getPreview).toHaveBeenCalledTimes(3);
    expect(getPreview).toHaveBeenNthCalledWith(3, "matchmaking", {
      visibleSections: { statsHighlightSlots: ["esra"] },
    });
  });

  it("keeps an unrequested series preview idle when settings change", async () => {
    const { presenter, store, previewService } = createHarness();
    const getPreview = vi.spyOn(previewService, "getPreview");
    const initialSettings: StreamerViewSettings = { visibleSections: { statsHighlightSlots: ["kda"] } };
    const updatedSettings: StreamerViewSettings = { visibleSections: { statsHighlightSlots: ["esra"] } };

    presenter.updateSettings(initialSettings);
    await vi.waitFor(() => {
      expect(store.getSnapshot().matchmaking.status).toBe("loaded");
    });

    presenter.updateSettings(updatedSettings);
    await vi.waitFor(() => {
      expect(getPreview).toHaveBeenCalledTimes(2);
      expect(store.getSnapshot().matchmaking.status).toBe("loaded");
    });

    expect(store.getSnapshot().series.status).toBe("idle");
    expect(getPreview).toHaveBeenLastCalledWith("matchmaking", updatedSettings);
  });

  it("does not reload previews when only display settings change", async () => {
    const { presenter, store, previewService } = createHarness();
    const getPreview = vi.spyOn(previewService, "getPreview");
    const playerSettings: StreamerViewSettings = {
      styleFlags: { colorMode: "player", playerTeamColor: "cerulean" },
      visibleSections: { statsHighlightSlots: ["kda"] },
    };
    const observerSettings: StreamerViewSettings = {
      styleFlags: { colorMode: "observer", observerTeamColor: "salmon" },
      visibleSections: { statsHighlightSlots: ["kda"] },
    };

    presenter.updateSettings(playerSettings);
    await vi.waitFor(() => {
      expect(store.getSnapshot().matchmaking.status).toBe("loaded");
    });

    presenter.updateSettings(observerSettings);

    expect(getPreview).toHaveBeenCalledOnce();
    expect(store.getSnapshot().matchmaking.status).toBe("loaded");
  });

  it("reloads requested modes when preview identity changes", async () => {
    const { presenter, store, previewService } = createHarness();
    const getPreview = vi.spyOn(previewService, "getPreview");
    const previewSettings: StreamerViewSettings = { visibleSections: { statsHighlightSlots: ["kda"] } };

    presenter.updateSettings(previewSettings, "demo");
    presenter.load("series", previewSettings, "demo");
    await vi.waitFor(() => {
      expect(store.getSnapshot().matchmaking.status).toBe("loaded");
      expect(store.getSnapshot().series.status).toBe("loaded");
    });

    presenter.updateSettings(previewSettings, "authenticated:Spartan");

    await vi.waitFor(() => {
      expect(getPreview).toHaveBeenCalledTimes(4);
      expect(store.getSnapshot().matchmaking.status).toBe("loaded");
      expect(store.getSnapshot().series.status).toBe("loaded");
    });
    expect(getPreview).toHaveBeenNthCalledWith(3, "matchmaking", {
      visibleSections: { statsHighlightSlots: ["kda"] },
    });
    expect(getPreview).toHaveBeenNthCalledWith(4, "series", undefined);
  });

  it("deduplicates repeated loads with identical settings", async () => {
    const { presenter, store, previewService } = createHarness();
    const getPreview = vi.spyOn(previewService, "getPreview");
    const previewSettings: StreamerViewSettings = { styleFlags: { colorMode: "observer" } };

    presenter.updateSettings(previewSettings);
    presenter.updateSettings(previewSettings);

    await vi.waitFor(() => {
      expect(store.getSnapshot().matchmaking.status).toBe("loaded");
    });
    expect(getPreview).toHaveBeenCalledOnce();
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
    const previewRequestSettings: StreamerViewSettings = {
      visibleSections: {
        statsHighlightSlots: previewSettings.visibleSections?.statsHighlightSlots,
      },
    };

    presenter.load("matchmaking", previewSettings);

    await vi.waitFor(() => {
      expect(store.getSnapshot().matchmaking.status).toBe("loaded");
    });
    expect(getPreview).toHaveBeenCalledWith("matchmaking", previewRequestSettings);
    const { matchmaking } = store.getSnapshot();
    expect(matchmaking.status).toBe("loaded");
    if (matchmaking.status !== "loaded") {
      throw new Error("Expected matchmaking preview to load");
    }
    expect(matchmaking.data.view.streamerSettings).toEqual(previewRequestSettings);
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
