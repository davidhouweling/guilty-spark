import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { RealDiscordSeriesStatsService } from "../discord-series";

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
});
