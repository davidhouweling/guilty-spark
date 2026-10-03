import { describe, expect, it, vi } from "vitest";
import { Locale } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import {
  buildDiscordSeriesRenderDataFromMatches,
  getDiscordSeriesStatsCacheKey,
  getDiscordSeriesStatsMatchIdsKey,
} from "../discord-series-stats";
import { aFakeDiscordServiceWith } from "../fakes/discord.fake";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { getMatchStats } from "../../halo/fakes/data";
import { guild } from "../fakes/data";

describe("buildDiscordSeriesRenderDataFromMatches()", () => {
  it("uses the guild's preferred locale instead of a hardcoded locale", async () => {
    const discordService = aFakeDiscordServiceWith();
    vi.spyOn(discordService, "getGuild").mockResolvedValue({ ...guild, preferred_locale: Locale.German });

    const haloService = aFakeHaloServiceWith();
    const getMatchScoreSpy = vi.spyOn(haloService, "getMatchScore");
    const getSeriesScoreSpy = vi.spyOn(haloService, "getSeriesScore");

    const match = Preconditions.checkExists(getMatchStats("d81554d7-ddfe-44da-a6cb-000000000ctf"));

    await buildDiscordSeriesRenderDataFromMatches({
      discordService,
      logService: aFakeLogServiceWith(),
      haloService,
      guildId: "fake-guild-id",
      queueNumber: 1,
      matches: [match],
    });

    expect(getMatchScoreSpy).toHaveBeenCalledWith(match, Locale.German, [match]);
    expect(getSeriesScoreSpy).toHaveBeenCalledWith([match], Locale.German);
  });
});

describe("getDiscordSeriesStatsCacheKey()", () => {
  it("separates manual series sharing the same queue number", () => {
    expect(getDiscordSeriesStatsCacheKey("guild-1", 7777, "series-one")).not.toBe(
      getDiscordSeriesStatsCacheKey("guild-1", 7777, "series-two"),
    );
  });
});

describe("DiscordService.cacheDiscordSeriesMatchIds()", () => {
  it("stores the manual series match-id lookup without an expiration", async () => {
    const env = aFakeEnvWith();
    const discordService = aFakeDiscordServiceWith({ env });
    const putSpy = vi.spyOn(env.APP_DATA, "put");
    const matchIds = ["match-one", "match-two"];

    await discordService.cacheDiscordSeriesMatchIds("guild-1", 7777, "series-one", matchIds);

    expect(putSpy).toHaveBeenCalledWith(
      getDiscordSeriesStatsMatchIdsKey("guild-1", 7777, "series-one"),
      JSON.stringify(matchIds),
    );
  });
});
