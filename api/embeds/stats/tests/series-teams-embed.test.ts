import { describe, beforeEach, expect, it } from "vitest";
import { MatchOutcome } from "halo-infinite-api";
import { aMatchWithSwappableRosters } from "../../../services/halo/fakes/data";
import { SeriesTeamsEmbed } from "../series-teams-embed";
import type { HaloService } from "../../../services/halo/halo";
import { aFakeHaloServiceWith } from "../../../services/halo/fakes/halo.fake";
import { aFakeDiscordServiceWith } from "../../../services/discord/fakes/discord.fake";
import type { DiscordService } from "../../../services/discord/discord";
import type { GuildConfigRow } from "../../../services/database/types/guild_config";
import { aFakeGuildConfigRow } from "../../../services/database/fakes/database.fake";

describe("SeriesTeamsEmbed", () => {
  const locale = "en-US";
  let discordService: DiscordService;
  let haloService: HaloService;
  let guildConfig: GuildConfigRow;
  let seriesTeamsEmbed: SeriesTeamsEmbed;

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    guildConfig = aFakeGuildConfigRow();
    seriesTeamsEmbed = new SeriesTeamsEmbed({ discordService, haloService, guildConfig, locale });
  });

  describe("getSeriesEmbed", () => {
    it("accumulates a team's stats under a single field even when it swaps sides mid-series", async () => {
      const rosterAAsTeam0 = aMatchWithSwappableRosters({
        matchId: "series-swap-game-1",
        startTime: "2024-11-26T10:00:00.000Z",
        mapAssetId: "map-a",
        team0PlayerIds: ["xuid(1)"],
        team1PlayerIds: ["xuid(2)"],
        team0Outcome: MatchOutcome.Win,
        team1Outcome: MatchOutcome.Loss,
      });
      // Same two rosters, but roster A (xuid 1) is now on TeamId 1
      const rosterAAsTeam1 = aMatchWithSwappableRosters({
        matchId: "series-swap-game-2",
        startTime: "2024-11-26T11:00:00.000Z",
        mapAssetId: "map-b",
        team0PlayerIds: ["xuid(2)"],
        team1PlayerIds: ["xuid(1)"],
        team0Outcome: MatchOutcome.Loss,
        team1Outcome: MatchOutcome.Win,
      });

      const result = await seriesTeamsEmbed.getSeriesEmbed([rosterAAsTeam0, rosterAAsTeam1]);

      // Exactly one field per team (not split into extra fields from a mismatched roster lookup)
      const teamFields = result.fields?.filter((field) => field.name !== "\n") ?? [];
      expect(teamFields).toHaveLength(2);
    });
  });
});
