import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { requestOverlayAutoStart } from "../overlay-auto-start";

describe("requestOverlayAutoStart()", () => {
  let fetchSpy: MockInstance<typeof globalThis.fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ success: true })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("POSTs the auto-start endpoint for the gamertag", async () => {
    await requestOverlayAutoStart("https://api.example.com", "KnownTag");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.example.com/u/KnownTag/auto-start");
    expect(init?.method).toBe("POST");
  });

  it("encodes gamertags containing characters that are not URL safe", async () => {
    await requestOverlayAutoStart("https://api.example.com", "Known Tag");

    const [url] = fetchSpy.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://api.example.com/u/Known%20Tag/auto-start");
  });

  it("resolves without throwing when the request fails", async () => {
    fetchSpy.mockRejectedValue(new Error("network down"));

    await expect(requestOverlayAutoStart("https://api.example.com", "KnownTag")).resolves.toBeUndefined();
  });
});
