import { describe, beforeEach, expect, it } from "vitest";
import { matchStats, playerXuidsToGametags } from "../../../../services/halo/fakes/data.mjs";
import { SlayerMatchEmbed } from "../slayer-match-embed.mjs";
import { HaloService } from "../../../../services/halo/halo.mjs";
import { Preconditions } from "../../../../base/preconditions.mjs";
import { aFakeHaloServiceWith } from "../../../../services/halo/fakes/halo.fake.mjs";

const match = Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"));

describe("SlayerMatchEmbed", () => {
  let haloService: HaloService;
  let matchEmbed: SlayerMatchEmbed;

  beforeEach(() => {
    haloService = aFakeHaloServiceWith();
    matchEmbed = new SlayerMatchEmbed(haloService);
  });

  describe("getEmbed", () => {
    it("returns the expected embed", async () => {
      const result = await matchEmbed.getEmbed(match, playerXuidsToGametags);
      expect(result).toMatchSnapshot();
    });
  });
});
