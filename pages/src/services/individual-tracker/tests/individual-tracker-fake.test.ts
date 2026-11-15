import { describe, expect, it } from "vitest";
import {
  aFakeCondensedMatchHistoryEntryWith,
  aFakeIndividualTrackerServiceWith,
} from "../fakes/individual-tracker.fake";

describe("FakeIndividualTrackerService", () => {
  describe("generateMaps", () => {
    it("uses the HCS mode sequence for the selected game count", async () => {
      const service = aFakeIndividualTrackerServiceWith();

      const maps = await service.generateMaps({ trackerId: "tracker-1", playlist: "C", format: "H", count: 5 });

      expect(maps.map((map) => map.mode)).toEqual(["Oddball", "Slayer", "Strongholds", "King of the Hill", "Slayer"]);
    });

    it("returns only objective modes when the objective format is selected", async () => {
      const service = aFakeIndividualTrackerServiceWith();

      const maps = await service.generateMaps({ trackerId: "tracker-1", playlist: "C", format: "O", count: 3 });

      expect(maps).toHaveLength(3);
      expect(maps.every((map) => map.mode !== "Slayer")).toBe(true);
    });

    it("uses Slayer maps for a Slayer-only playlist regardless of the requested format", async () => {
      const service = aFakeIndividualTrackerServiceWith();

      const maps = await service.generateMaps({ trackerId: "tracker-1", playlist: "S", format: "O", count: 3 });

      expect(maps).toHaveLength(3);
      expect(maps.every((map) => map.mode === "Slayer")).toBe(true);
    });

    it("keeps Current HCS fake maps within the supported map pool", async () => {
      const service = aFakeIndividualTrackerServiceWith();

      const maps = await service.generateMaps({ trackerId: "tracker-1", playlist: "C", format: "H", count: 9 });

      expect(maps).toHaveLength(9);
      expect(
        maps.every(({ mode, map }) =>
          mode === "King of the Hill" ? ["Live Fire", "Lattice", "Recharge", "Streets"].includes(map) : true,
        ),
      ).toBe(true);
    });

    it("limits Ranked Doubles to its supported mode pool", async () => {
      const service = aFakeIndividualTrackerServiceWith();

      const maps = await service.generateMaps({ trackerId: "tracker-1", playlist: "D", format: "R", count: 3 });

      expect(maps).toHaveLength(3);
      expect(maps.every((map) => map.mode === "Slayer" || map.mode === "Capture the Flag")).toBe(true);
    });

    describe("getCondensedMatchHistory", () => {
      it("filters and paginates typed rows while retaining only matching groupings", async () => {
        const service = aFakeIndividualTrackerServiceWith({
          condensedMatchHistory: {
            matches: [
              aFakeCondensedMatchHistoryEntryWith({ matchId: "matchmade", category: "matchmaking" }),
              aFakeCondensedMatchHistoryEntryWith({ matchId: "a" }),
              aFakeCondensedMatchHistoryEntryWith({ matchId: "b" }),
              aFakeCondensedMatchHistoryEntryWith({ matchId: "c" }),
            ],
            suggestedGroupings: [["a", "b", "c"]],
          },
        });

        const page = await service.getCondensedMatchHistory({
          xuid: "123",
          start: 1,
          count: 2,
          category: "custom",
        });

        expect(page.matches.map((match) => match.matchId)).toEqual(["b", "c"]);
        expect(page.suggestedGroupings).toEqual([["b", "c"]]);
        await expect(service.getCondensedMatchHistory({ xuid: "123", start: 4, count: 25 })).resolves.toEqual({
          matches: [],
          suggestedGroupings: [],
        });
      });
    });
  });
});
