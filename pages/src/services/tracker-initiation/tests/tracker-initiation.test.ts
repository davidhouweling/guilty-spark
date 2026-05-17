import { describe, expect, it, vi, beforeEach, type MockInstance } from "vitest";
import { RealTrackerInitiationService } from "../tracker-initiation";
import type { MatchHistoryResponse } from "../../../components/tracker-initiation/types";
import type { StartTrackerRequest } from "../types";

function createMockResponse(data: unknown, options: { ok?: boolean; status?: number } = {}): Response {
  const ok = options.ok ?? true;
  const status = options.status ?? (ok ? 200 : 500);

  const response = new Response(JSON.stringify(data), { status, statusText: ok ? "OK" : "Error" });
  return response;
}

describe("RealTrackerInitiationService", () => {
  let fetchSpy: MockInstance<typeof globalThis.fetch>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  describe("fetchMatchHistory", () => {
    it("constructs correct URL with encoded gamertag", async () => {
      const service = new RealTrackerInitiationService({ apiHost: "https://api.example.com" });
      const mockResponse: MatchHistoryResponse = {
        gamertag: "Test Player",
        xuid: "xuid(123)",
        matches: [],
        suggestedGroupings: [],
      };

      fetchSpy.mockResolvedValue(createMockResponse(mockResponse));

      await service.fetchMatchHistory("Test Player");

      expect(fetchSpy).toHaveBeenCalledWith("https://api.example.com/api/tracker/individual/Test%20Player/matches");
    });

    it("returns match history response on success", async () => {
      const service = new RealTrackerInitiationService({ apiHost: "https://api.example.com" });
      const mockResponse: MatchHistoryResponse = {
        gamertag: "PlayerOne",
        xuid: "xuid(456)",
        matches: [
          {
            matchId: "match-1",
            startTime: "2026-03-15T10:00:00Z",
            endTime: "2026-03-15T10:15:00Z",
            duration: "15:23",
            mapName: "Aquarius",
            modeName: "Slayer",
            outcome: "Win",
            resultString: "50-49",
            isMatchmaking: true,
            teams: [
              ["xuid1", "xuid2"],
              ["xuid3", "xuid4"],
            ],
            mapThumbnailUrl: "https://example.com/map.jpg",
          },
        ],
        suggestedGroupings: [["match-1"]],
      };

      fetchSpy.mockResolvedValue(createMockResponse(mockResponse));

      const result = await service.fetchMatchHistory("PlayerOne");

      expect(result).toEqual(mockResponse);
      expect(result.matches).toHaveLength(1);
      expect(result.suggestedGroupings).toHaveLength(1);
    });

    it("throws 'Gamertag not found' error when status is 404", async () => {
      const service = new RealTrackerInitiationService({ apiHost: "https://api.example.com" });

      fetchSpy.mockResolvedValue(createMockResponse(null, { ok: false, status: 404 }));

      await expect(service.fetchMatchHistory("NonExistent")).rejects.toThrow("Gamertag not found");
    });

    it("throws 'Failed to fetch match history' error for other HTTP errors", async () => {
      const service = new RealTrackerInitiationService({ apiHost: "https://api.example.com" });

      fetchSpy.mockResolvedValue(createMockResponse(null, { ok: false, status: 500 }));

      await expect(service.fetchMatchHistory("PlayerOne")).rejects.toThrow("Failed to fetch match history");
    });

    it("handles special characters in gamertag", async () => {
      const service = new RealTrackerInitiationService({ apiHost: "https://api.example.com" });
      const mockResponse: MatchHistoryResponse = {
        gamertag: "Player@123",
        xuid: "xuid(789)",
        matches: [],
        suggestedGroupings: [],
      };

      fetchSpy.mockResolvedValue(createMockResponse(mockResponse));

      await service.fetchMatchHistory("Player@123");

      expect(fetchSpy).toHaveBeenCalledWith("https://api.example.com/api/tracker/individual/Player%40123/matches");
    });
  });

  describe("startTracker", () => {
    it("constructs correct request body and URL", async () => {
      const service = new RealTrackerInitiationService({ apiHost: "https://api.example.com" });
      const request: StartTrackerRequest = {
        gamertag: "TestPlayer",
        selectedMatchIds: ["match-1", "match-2"],
        groupings: [["match-1", "match-2"]],
      };

      fetchSpy.mockResolvedValue(
        createMockResponse({ success: true, websocketUrl: "/ws/tracker/individual/TestPlayer" }),
      );

      await service.startTracker(request);

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.example.com/api/tracker/individual/start",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            gamertag: "TestPlayer",
            selectedMatchIds: ["match-1", "match-2"],
            groupings: [["match-1", "match-2"]],
          }),
        }),
      );
    });

    it("returns success response with websocket URL", async () => {
      const service = new RealTrackerInitiationService({ apiHost: "https://api.example.com" });
      const request: StartTrackerRequest = {
        gamertag: "TestPlayer",
        selectedMatchIds: ["match-1"],
        groupings: [],
      };

      fetchSpy.mockResolvedValue(
        createMockResponse({
          success: true,
          websocketUrl: "/ws/tracker/individual/TestPlayer",
          gamertag: "TestPlayer",
        }),
      );

      const result = await service.startTracker(request);

      expect(result).toEqual({
        success: true,
        websocketUrl: "/ws/tracker/individual/TestPlayer",
        gamertag: "TestPlayer",
      });
    });

    it("returns failure response when HTTP request fails", async () => {
      const service = new RealTrackerInitiationService({ apiHost: "https://api.example.com" });
      const request: StartTrackerRequest = {
        gamertag: "TestPlayer",
        selectedMatchIds: ["match-1"],
        groupings: [],
      };

      fetchSpy.mockResolvedValue(createMockResponse(null, { ok: false, status: 500 }));

      const result = await service.startTracker(request);

      expect(result).toEqual({
        success: false,
        error: "Failed to start tracker",
      });
    });

    it("returns failure response when API returns error", async () => {
      const service = new RealTrackerInitiationService({ apiHost: "https://api.example.com" });
      const request: StartTrackerRequest = {
        gamertag: "TestPlayer",
        selectedMatchIds: ["match-1"],
        groupings: [],
      };

      fetchSpy.mockResolvedValue(createMockResponse({ success: false, error: "Player not found" }));

      const result = await service.startTracker(request);

      expect(result).toEqual({
        success: false,
        error: "Player not found",
      });
    });

    it("returns failure response when API response is missing websocketUrl", async () => {
      const service = new RealTrackerInitiationService({ apiHost: "https://api.example.com" });
      const request: StartTrackerRequest = {
        gamertag: "TestPlayer",
        selectedMatchIds: ["match-1"],
        groupings: [],
      };

      fetchSpy.mockResolvedValue(createMockResponse({ success: true }));

      const result = await service.startTracker(request);

      expect(result).toEqual({
        success: false,
        error: "Failed to start tracker",
      });
    });

    it("handles empty selected matches (start from now)", async () => {
      const service = new RealTrackerInitiationService({ apiHost: "https://api.example.com" });
      const request: StartTrackerRequest = {
        gamertag: "TestPlayer",
        selectedMatchIds: [],
        groupings: [],
      };

      fetchSpy.mockResolvedValue(
        createMockResponse({ success: true, websocketUrl: "/ws/tracker/individual/TestPlayer" }),
      );

      const result = await service.startTracker(request);

      expect(result.success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.example.com/api/tracker/individual/start",
        expect.objectContaining({
          body: JSON.stringify({
            gamertag: "TestPlayer",
            selectedMatchIds: [],
            groupings: [],
          }),
        }),
      );
    });

    it("handles multiple groupings", async () => {
      const service = new RealTrackerInitiationService({ apiHost: "https://api.example.com" });
      const request: StartTrackerRequest = {
        gamertag: "TestPlayer",
        selectedMatchIds: ["match-1", "match-2", "match-3", "match-4"],
        groupings: [
          ["match-1", "match-2"],
          ["match-3", "match-4"],
        ],
      };

      fetchSpy.mockResolvedValue(
        createMockResponse({ success: true, websocketUrl: "/ws/tracker/individual/TestPlayer" }),
      );

      await service.startTracker(request);

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://api.example.com/api/tracker/individual/start",
        expect.objectContaining({
          body: JSON.stringify({
            gamertag: "TestPlayer",
            selectedMatchIds: ["match-1", "match-2", "match-3", "match-4"],
            groupings: [
              ["match-1", "match-2"],
              ["match-3", "match-4"],
            ],
          }),
        }),
      );
    });

    it("uses default error message when API error is undefined", async () => {
      const service = new RealTrackerInitiationService({ apiHost: "https://api.example.com" });
      const request: StartTrackerRequest = {
        gamertag: "TestPlayer",
        selectedMatchIds: ["match-1"],
        groupings: [],
      };

      fetchSpy.mockResolvedValue(createMockResponse({ success: false }));

      const result = await service.startTracker(request);

      expect(result).toEqual({
        success: false,
        error: "Failed to start tracker",
      });
    });
  });
});
