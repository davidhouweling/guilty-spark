import { describe, beforeEach, expect, it } from "vitest";
import { matchStats, playerXuidsToGametags } from "../../../../services/halo/fakes/data.mjs";
import { SeriesMatchesEmbed } from "../series-matches-embed.mjs";
import type { HaloService } from "../../../../services/halo/halo.mjs";
import { Preconditions } from "../../../../base/preconditions.mjs";
import { aFakeHaloServiceWith } from "../../../../services/halo/fakes/halo.fake.mjs";

const ctfMatch = Preconditions.checkExists(matchStats.get("d81554d7-ddfe-44da-a6cb-000000000ctf"));
const kothMatch = Preconditions.checkExists(matchStats.get("e20900f9-4c6c-4003-a175-00000000koth"));
const slayerMatch = Preconditions.checkExists(matchStats.get("9535b946-f30c-4a43-b852-000000slayer"));
const matches = [ctfMatch, kothMatch, slayerMatch];

describe("SeriesMatchesEmbed", () => {
  let haloService: HaloService;
  let seriesMatchesEmbed: SeriesMatchesEmbed;

  beforeEach(() => {
    haloService = aFakeHaloServiceWith();
    seriesMatchesEmbed = new SeriesMatchesEmbed(haloService);
  });

  describe("getEmbed", () => {
    it("returns promise reject", async () => {
      await expect(seriesMatchesEmbed.getEmbed(slayerMatch, playerXuidsToGametags)).rejects.toThrowError(
        "Series matches embed does not support single match, use getSeriesEmbed instead",
      );
    });
  });

  describe("getSeriesEmbed", () => {
    it("returns the expected embed", () => {
      const result = seriesMatchesEmbed.getSeriesEmbed(matches, playerXuidsToGametags);
      expect(result).toMatchSnapshot();
    });
  });
});
