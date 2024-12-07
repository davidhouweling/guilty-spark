import { describe, beforeEach, expect, it } from "vitest";
import { matchStats, playerXuidsToGametags } from "../../../../services/halo/fakes/data.mjs";
import { CtfMatchEmbed } from "../ctf-match-embed.mjs";
import { HaloService } from "../../../../services/halo/halo.mjs";
import { Preconditions } from "../../../../base/preconditions.mjs";
import { aFakeHaloServiceWith } from "../../../../services/halo/fakes/halo.fake.mjs";

const match = Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"));

describe("CtfMatchEmbed", () => {
  let haloService: HaloService;
  let matchEmbed: CtfMatchEmbed;

  beforeEach(() => {
    haloService = aFakeHaloServiceWith();
    matchEmbed = new CtfMatchEmbed(haloService);
  });

  describe("getEmbed", () => {
    it("returns the expected embed", async () => {
      const result = await matchEmbed.getEmbed(match, playerXuidsToGametags);
      expect(result).toMatchSnapshot();
    });
  });
});
