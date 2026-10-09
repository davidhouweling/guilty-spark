import { describe, expect, it } from "vitest";
import { aFakeIndividualTrackerServiceWith } from "../fakes/individual-tracker.fake";

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

    it("limits Ranked Doubles to its supported mode pool", async () => {
      const service = aFakeIndividualTrackerServiceWith();

      const maps = await service.generateMaps({ trackerId: "tracker-1", playlist: "D", format: "R", count: 3 });

      expect(maps).toHaveLength(3);
      expect(maps.every((map) => map.mode === "Slayer" || map.mode === "Capture the Flag")).toBe(true);
    });
  });
});
