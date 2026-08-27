import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import type { ActiveSeriesSummary } from "@guilty-spark/shared/contracts/neatqueue/active-series";
import { RealNeatQueueClientService } from "../neatqueue";

function jsonResponse(payload: object, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const FAKE_SERIES: ActiveSeriesSummary = {
  guildId: "guild-1",
  queueNumber: 5,
  title: "Test Server",
  subtitle: "Queue #5",
  guildIconUrl: null,
  startedAt: "2026-08-01T10:00:00.000Z",
  teams: [{ id: 0, name: "Eagle", players: [{ gamertag: "Chief", xboxId: "xuid-1" }] }],
};

describe("RealNeatQueueClientService", () => {
  let fetchSpy: MockInstance;
  let service: RealNeatQueueClientService;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    service = new RealNeatQueueClientService({ apiHost: "https://api.example.com" });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("lists active series with credentials included", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ series: [FAKE_SERIES] }));

    const result = await service.listActiveSeries();

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/api/neatqueue/active-series",
      expect.objectContaining({ method: "GET", credentials: "include" }),
    );
    expect(result).toEqual([FAKE_SERIES]);
  });

  it("throws when the response is not ok", async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }, 401));

    await expect(service.listActiveSeries()).rejects.toThrow("Unauthorized");
  });
});
