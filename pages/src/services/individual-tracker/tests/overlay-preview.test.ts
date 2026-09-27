import { afterEach, describe, expect, it, vi } from "vitest";
import { overlayPreviewContract } from "@guilty-spark/shared/contracts/individual-tracker/overlay-preview";
import { aFakeTrackerViewStateWith } from "../fakes/view.fake";
import { RealOverlayPreviewService } from "../overlay-preview";

describe("RealOverlayPreviewService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requests the selected mode with cookies and parses the response contract", async () => {
    const view = aFakeTrackerViewStateWith({ gamertag: "soundmanD" });
    const response = overlayPreviewContract.toResponse({ view, mode: "series", isExample: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    const service = new RealOverlayPreviewService({ apiHost: "https://api.example.com/" });

    const result = await service.getPreview("series");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/overlay-preview?mode=series",
      { credentials: "include" },
    );
    expect(result).toEqual({ view, mode: "series", isExample: true });
  });

  it("surfaces the API error on a failed response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Preview unavailable" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const service = new RealOverlayPreviewService({ apiHost: "https://api.example.com" });

    await expect(service.getPreview("matchmaking")).rejects.toThrow("Preview unavailable");
  });

  it("sends local stats-highlight slot selections with the mode query", async () => {
    const view = aFakeTrackerViewStateWith({ gamertag: "soundmanD" });
    const response = overlayPreviewContract.toResponse({ view, mode: "matchmaking", isExample: true });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    const service = new RealOverlayPreviewService({ apiHost: "https://api.example.com" });

    await service.getPreview("matchmaking", ["kda", "total-games"]);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/individual-tracker/overlay-preview?mode=matchmaking&statsHighlightSlots=kda%2Ctotal-games",
      { credentials: "include" },
    );
  });
});
