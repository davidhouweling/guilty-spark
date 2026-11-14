import { describe, expect, it, vi } from "vitest";
import { installServices } from "../services";

describe("match history viewer services", () => {
  it("installs the prepared history service in fake mode", async () => {
    vi.stubEnv("MODE", "fake");
    try {
      const services = await installServices("https://api.example.com");
      const page = await services.condensedMatchHistoryService.getMatchHistory({ xuid: "123", start: 0, count: 25 });

      expect(page.matches[0]).toMatchObject({ matchId: "history-match-1", scoreDisplay: "50:42" });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
