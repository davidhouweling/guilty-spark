import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSeriesSource } from "../resolve-series-source";

const archive = { status: 200, retryAfterSeconds: null };
const lookup = vi.fn<() => Promise<typeof archive>>();

afterEach(() => {
  vi.restoreAllMocks();
  lookup.mockReset();
});

describe("resolveSeriesSource", () => {
  it.each(["active", "paused"])("selects %s tracker without querying archive", async (status) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ state: { status } }));
    expect(await resolveSeriesSource("https://api.example/base", "123", "4", lookup)).toEqual({ source: "live" });
    expect(fetchSpy).toHaveBeenCalledWith("https://api.example/base/tracker/123/4/status", { cache: "no-store" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each(["absent", "stopped"])("uses archive lookup when tracker is %s", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      status === "absent" ? new Response(null, { status: 404 }) : Response.json({ state: { status } }),
    );
    lookup.mockResolvedValue(archive);
    expect(await resolveSeriesSource("https://api.example", "123", "4", lookup)).toEqual({
      source: "archive",
      lookup: archive,
    });
    expect(lookup).toHaveBeenCalledOnce();
  });

  it.each([401, 403, 429, 500, 503])("surfaces status %i without archive fallback", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status }));
    expect(await resolveSeriesSource("https://api.example", "123", "4", lookup)).toEqual({ source: "error", status });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("propagates transport and malformed status failures without archive fallback", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));
    await expect(resolveSeriesSource("https://api.example", "123", "4", lookup)).rejects.toThrow("network");
    fetchSpy.mockResolvedValueOnce(Response.json({ state: { status: "unexpected" } }));
    await expect(resolveSeriesSource("https://api.example", "123", "4", lookup)).rejects.toThrow();
    expect(lookup).not.toHaveBeenCalled();
  });

  it.each([403, 404, 503, 500])("preserves archive lookup status %i", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    const lookupArchive = vi.fn().mockResolvedValue({ status, retryAfterSeconds: status === 503 ? 9 : null });
    expect(await resolveSeriesSource("https://api.example", "123", "4", lookupArchive)).toEqual({
      source: "archive",
      lookup: { status, retryAfterSeconds: status === 503 ? 9 : null },
    });
  });
});
