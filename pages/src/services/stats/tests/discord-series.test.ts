import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { fetchDiscordSeriesStats } from "../discord-series";

describe("fetchDiscordSeriesStats", () => {
  let fetchSpy: MockInstance<typeof globalThis.fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
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

    const result = await fetchDiscordSeriesStats("https://api.example.com/api/stats/discord/123456789012345678/7777");

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

    const result = await fetchDiscordSeriesStats("https://api.example.com/api/stats/discord/123456789012345678/7777");

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

    const result = await fetchDiscordSeriesStats("https://api.example.com/api/stats/discord/123456789012345678/7777");

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

    const result = await fetchDiscordSeriesStats("https://api.example.com/api/stats/discord/123456789012345678/7777");

    expect(result.status).toBe(503);
    expect(result.retryAfterSeconds).toBeNull();
    expect(result.data.status).toBe("pending-index");
  });
});
