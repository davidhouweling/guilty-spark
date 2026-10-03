import { describe, expect, it, vi } from "vitest";
import { Locale } from "discord-api-types/v10";
import { Preconditions } from "@guilty-spark/shared/base/preconditions";
import { MatchOutcome } from "halo-infinite-api";
import { aFakeEnvWith } from "../../../base/fakes/env.fake";
import {
  buildDiscordSeriesRenderDataFromMatches,
  getDiscordSeriesStatsCacheKey,
  getDiscordSeriesStatsMatchIdsKey,
} from "../discord-series-stats";
import { aFakeDiscordServiceWith } from "../fakes/discord.fake";
import { aFakeHaloServiceWith } from "../../halo/fakes/halo.fake";
import { aFakeLogServiceWith } from "../../log/fakes/log.fake";
import { getMatchStats, aMatchWithSwappableRosters } from "../../halo/fakes/data";
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

  it("maps manual substitute scores and series outcomes on a cache rebuild", async () => {
    const discordService = aFakeDiscordServiceWith();
    const haloService = aFakeHaloServiceWith();
    const anchorMatch = aMatchWithSwappableRosters({
      matchId: "manual-anchor",
      startTime: "2026-10-03T10:00:00Z",
      mapAssetId: "manual-map-1",
      team0PlayerIds: ["0100000000000000", "0200000000000000"],
      team1PlayerIds: ["0400000000000000", "0800000000000000"],
      team0Outcome: MatchOutcome.Win.valueOf(),
      team1Outcome: MatchOutcome.Loss.valueOf(),
    });
    const substituteMatch = aMatchWithSwappableRosters({
      matchId: "manual-substitute",
      startTime: "2026-10-03T10:15:00Z",
      mapAssetId: "manual-map-2",
      team0PlayerIds: ["0400000000000000", "0800000000000000"],
      team1PlayerIds: ["0100000000000000", "0900000000000000"],
      team0Outcome: MatchOutcome.Loss.valueOf(),
      team1Outcome: MatchOutcome.Win.valueOf(),
    });
    const matches = [anchorMatch, substituteMatch].map((match, matchIndex) => ({
      ...match,
      Teams: match.Teams.map((team, teamIndex) => ({
        ...team,
        TeamId: team.TeamId + 2,
        Stats: {
          ...team.Stats,
          CoreStats: {
            ...team.Stats.CoreStats,
            Score: matchIndex === 0 ? (teamIndex === 0 ? 50 : 20) : teamIndex === 0 ? 15 : 40,
          },
        },
      })),
      Players: match.Players.map((player) => ({
        ...player,
        LastTeamId: player.LastTeamId + 2,
        PlayerTeamStats: player.PlayerTeamStats.map((teamStats) => ({
          ...teamStats,
          TeamId: teamStats.TeamId + 2,
        })),
      })),
    }));

    const renderData = await buildDiscordSeriesRenderDataFromMatches({
      discordService,
      logService: aFakeLogServiceWith(),
      haloService,
      guildId: "fake-guild-id",
      queueNumber: 42,
      matches,
      locale: "en-US",
      isManualSeries: true,
    });

    expect(renderData.seriesScore).toBe("2:0");
    expect(renderData.matches.map((match) => match.gameScore)).toEqual(["50:20", "40:15"]);
    expect(renderData.teams.map((team) => team.name)).toEqual(["Hades", "Valkyrie"]);
    expect(renderData.matches[1]?.rawMatch).toMatchObject({ Teams: [{ TeamId: 2 }, { TeamId: 3 }] });
    expect(renderData.matches[1]?.seriesMatch).toMatchObject({ Teams: [{ TeamId: 2 }, { TeamId: 3 }] });
    expect(renderData.matches[1]?.rawMatch).not.toEqual(renderData.matches[1]?.seriesMatch);
  });
});

describe("getDiscordSeriesStatsCacheKey()", () => {
  it("uses the guild and queue number as the stats identity", () => {
    expect(getDiscordSeriesStatsCacheKey("guild-1", 7777)).toBe("stats:discord:series:guild-1:7777");
    expect(getDiscordSeriesStatsMatchIdsKey("guild-1", 7777)).toBe("stats:discord:series:guild-1:7777:match-ids");
  });
});

describe("DiscordService.cacheDiscordSeriesMatchIds()", () => {
  it("stores the manual series match-id lookup without an expiration", async () => {
    const env = aFakeEnvWith();
    const discordService = aFakeDiscordServiceWith({ env });
    const putSpy = vi.spyOn(env.APP_DATA, "put");
    const matchIds = ["match-one", "match-two"];

    await discordService.cacheDiscordSeriesMatchIds("guild-1", 7777, matchIds);

    expect(putSpy).toHaveBeenCalledWith(getDiscordSeriesStatsMatchIdsKey("guild-1", 7777), JSON.stringify(matchIds));
  });
});
