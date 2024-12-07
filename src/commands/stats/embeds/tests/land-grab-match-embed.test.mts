import { describe, beforeEach, expect, it } from "vitest";
import { matchStats, playerXuidsToGametags } from "../../../../services/halo/fakes/data.mjs";
import { LandGrabMatchEmbed } from "../land-grab-match-embed.mjs";
import { HaloService } from "../../../../services/halo/halo.mjs";
import { Preconditions } from "../../../../base/preconditions.mjs";
import { aFakeHaloServiceWith } from "../../../../services/halo/fakes/halo.fake.mjs";

const match = Preconditions.checkExists(matchStats.get("32b4cddf-5451-4d83-bcf6-000land-grab"));

describe("LandGrabMatchEmbed", () => {
  let haloService: HaloService;
  let matchEmbed: LandGrabMatchEmbed;

  beforeEach(() => {
    haloService = aFakeHaloServiceWith();
    matchEmbed = new LandGrabMatchEmbed(haloService);
  });

  describe("getEmbed", () => {
    it("returns the expected embed", async () => {
      const result = await matchEmbed.getEmbed(match, playerXuidsToGametags);
      expect(result).toMatchSnapshot();
    });
  });
});
