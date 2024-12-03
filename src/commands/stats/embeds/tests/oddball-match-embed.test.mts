import { describe, beforeEach, expect, it } from "vitest";
import { matchStats, playerXuidsToGametags } from "../../../../services/halo/fakes/data.mjs";
import { OddballMatchEmbed } from "../oddball-match-embed.mjs";
import { HaloService } from "../../../../services/halo/halo.mjs";
import { Preconditions } from "../../../../base/preconditions.mjs";
import { aFakeHaloServiceWith } from "../../../../services/halo/fakes/halo.fake.mjs";

const match = Preconditions.checkExists(matchStats.get("cf0fb794-2df1-4ba1-9415-00000oddball"));

describe("OddballMatchEmbed", () => {
  let haloService: HaloService;
  let matchEmbed: OddballMatchEmbed;

  beforeEach(() => {
    haloService = aFakeHaloServiceWith();
    matchEmbed = new OddballMatchEmbed(haloService);
  });

  describe("getEmbed", () => {
    it("returns the expected embed", async () => {
      const result = await matchEmbed.getEmbed(match, playerXuidsToGametags);
      expect(result).toMatchSnapshot();
    });
  });
});
