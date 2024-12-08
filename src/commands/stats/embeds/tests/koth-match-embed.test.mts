import { describe, beforeEach, expect, it } from "vitest";
import { matchStats, playerXuidsToGametags } from "../../../../services/halo/fakes/data.mjs";
import { KOTHMatchEmbed } from "../koth-match-embed.mjs";
import type { HaloService } from "../../../../services/halo/halo.mjs";
import { Preconditions } from "../../../../base/preconditions.mjs";
import { aFakeHaloServiceWith } from "../../../../services/halo/fakes/halo.fake.mjs";

const match = Preconditions.checkExists(matchStats.get("e20900f9-4c6c-4003-a175-00000000koth"));

describe("KOTHMatchEmbed", () => {
  let haloService: HaloService;
  let matchEmbed: KOTHMatchEmbed;

  beforeEach(() => {
    haloService = aFakeHaloServiceWith();
    matchEmbed = new KOTHMatchEmbed(haloService);
  });

  describe("getEmbed", () => {
    it("returns the expected embed", async () => {
      const result = await matchEmbed.getEmbed(match, playerXuidsToGametags);
      expect(result).toMatchSnapshot();
    });
  });
});
