import { discordSeriesStatsContract } from "@guilty-spark/shared/contracts/stats/discord-series";
import { seriesDetailContract } from "@guilty-spark/shared/contracts/stats/detail";
import { errorContract } from "@guilty-spark/shared/contracts/error";
import { aFakeSeriesDetailResponseWith } from "@guilty-spark/shared/contracts/stats/fakes/detail.fake";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { RealDiscordSeriesStatsService } from "../discord-series";
import { aFakeDiscordSeriesStatsResultWith } from "../fakes/discord-series.fake";

describe("RealDiscordSeriesStatsService", () => {
  let fetchSpy: MockInstance<typeof globalThis.fetch>;
  let service: RealDiscordSeriesStatsService;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    service = new RealDiscordSeriesStatsService({ apiHost: "https://api.example.com" });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe("getDetail", () => {
    it("returns the parsed detail contract and requests the detail endpoint", async () => {
      const data = aFakeSeriesDetailResponseWith({
        context: { title: "Queue #7777 Series Stats", subtitle: "Test guild", guildIconUrl: null },
      });
      fetchSpy.mockResolvedValueOnce(seriesDetailContract.toResponse(data));

      await expect(service.getDetail("123456789012345678", "7777")).resolves.toEqual({
        status: 200,
        data,
        retryAfterSeconds: null,
      });
      expect(fetchSpy).toHaveBeenCalledWith("https://api.example.com/api/stats/discord/123456789012345678/7777/detail");
    });

    it.each([
      { status: 503, data: { status: "pending-index", guildId: "123", queueNumber: 7777, retryAfterSeconds: 3 } },
      { status: 403, data: { status: "forbidden", guildId: "123", queueNumber: 7777, reason: "Access denied" } },
      { status: 404, data: { status: "not-found", guildId: "123", queueNumber: 7777, reason: "No matching series" } },
    ])("preserves $data.status and parses Retry-After", async ({ status, data }) => {
      const parsed = discordSeriesStatsContract.parse(data);
      fetchSpy.mockResolvedValueOnce(
        discordSeriesStatsContract.toResponse(parsed, { status, headers: { "Retry-After": " 7 " } }),
      );

      await expect(service.getDetail("123", "7777")).resolves.toEqual({
        status,
        data: parsed,
        retryAfterSeconds: 7,
      });
    });

    it.each(["invalid", "1e+21", "0", "-1", "1.5", "9007199254740992"])(
      "returns null for invalid detail Retry-After %s",
      async (retryAfter) => {
        fetchSpy.mockResolvedValueOnce(
          seriesDetailContract.toResponse(aFakeSeriesDetailResponseWith(), {
            headers: { "Retry-After": retryAfter },
          }),
        );

        const result = await service.getDetail("123", "7777");

        expect(result.retryAfterSeconds).toBeNull();
      },
    );

    it.each([200, 403, 404, 503])("rejects malformed contracts on HTTP %s", async (status) => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "not-found" }), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      );

      await expect(service.getDetail("123", "7777")).rejects.toThrow();
    });

    it.each([200, 503])("rejects old resolved stats payloads on HTTP %s", async (status) => {
      fetchSpy.mockResolvedValueOnce(
        discordSeriesStatsContract.toResponse(aFakeDiscordSeriesStatsResultWith().data, { status }),
      );

      await expect(service.getDetail("123", "7777")).rejects.toThrow();
    });

    it("rejects lookup-shaped fallback payloads on HTTP 200", async () => {
      fetchSpy.mockResolvedValueOnce(
        discordSeriesStatsContract.toResponse({
          status: "pending-index",
          guildId: "123",
          queueNumber: 7777,
          retryAfterSeconds: 3,
        }),
      );

      await expect(service.getDetail("123", "7777")).rejects.toThrow();
    });

    it("rejects server error contracts rather than turning them into lookup statuses", async () => {
      fetchSpy.mockResolvedValueOnce(
        errorContract.toResponse({ error: "Failed to resolve discord series detail" }, { status: 500 }),
      );

      await expect(service.getDetail("123", "7777")).rejects.toThrow();
    });

    it("propagates fetch errors", async () => {
      const error = new Error("Network failure");
      fetchSpy.mockRejectedValueOnce(error);

      await expect(service.getDetail("123", "7777")).rejects.toBe(error);
    });
  });

  it("returns Retry-After header value when present", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "pending-index",
          guildId: "123456789012345678",
          queueNumber: 7777,
          retryAfterSeconds: 3,
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "7",
          },
        },
      ),
    );

    const result = await service.getStats("123456789012345678", "7777");

    expect(result.status).toBe(503);
    expect(result.retryAfterSeconds).toBe(7);
    expect(result.data.status).toBe("pending-index");
  });

  it("returns null Retry-After when invalid", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "pending-index",
          guildId: "123456789012345678",
          queueNumber: 7777,
          retryAfterSeconds: 3,
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "invalid",
          },
        },
      ),
    );

    const result = await service.getStats("123456789012345678", "7777");

    expect(result.status).toBe(503);
    expect(result.retryAfterSeconds).toBeNull();
    expect(result.data.status).toBe("pending-index");
  });

  it("returns null Retry-After when header is missing", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "pending-index",
          guildId: "123456789012345678",
          queueNumber: 7777,
          retryAfterSeconds: 3,
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    const result = await service.getStats("123456789012345678", "7777");

    expect(result.status).toBe(503);
    expect(result.retryAfterSeconds).toBeNull();
    expect(result.data.status).toBe("pending-index");
  });

  it("returns null Retry-After for non-digit numeric strings", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "pending-index",
          guildId: "123456789012345678",
          queueNumber: 7777,
          retryAfterSeconds: 3,
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "1e+21",
          },
        },
      ),
    );

    const result = await service.getStats("123456789012345678", "7777");

    expect(result.status).toBe(503);
    expect(result.retryAfterSeconds).toBeNull();
    expect(result.data.status).toBe("pending-index");
  });

  it("returns lookup status and Retry-After when present", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 503,
        headers: {
          "Retry-After": "5",
        },
      }),
    );

    const result = await service.getLookup("123456789012345678", "7777");

    expect(result.status).toBe(503);
    expect(result.retryAfterSeconds).toBe(5);
  });

  it("returns null lookup Retry-After when header is invalid", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 503,
        headers: {
          "Retry-After": "invalid",
        },
      }),
    );

    const result = await service.getLookup("123456789012345678", "7777");

    expect(result.status).toBe(503);
    expect(result.retryAfterSeconds).toBeNull();
  });

  it("uses the queue number for stats and lookup requests", async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "not-found",
            guildId: "123456789012345678",
            queueNumber: 7777,
            reason: "No matching manual series stats were found",
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    await service.getStats("123456789012345678", "7777");
    await service.getLookup("123456789012345678", "7777");

    expect(fetchSpy).toHaveBeenNthCalledWith(1, "https://api.example.com/api/stats/discord/123456789012345678/7777");
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      "https://api.example.com/api/stats/discord/123456789012345678/7777/lookup",
    );
  });
});
