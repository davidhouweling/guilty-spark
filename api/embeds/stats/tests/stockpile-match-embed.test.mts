import { describe, beforeEach, expect, it } from "vitest";
import { GameVariantCategory } from "halo-infinite-api";
import type { MatchStats } from "halo-infinite-api";
import { StockpileMatchEmbed } from "../stockpile-match-embed.mjs";
import type { HaloService } from "../../../services/halo/halo.mjs";
import { aFakeHaloServiceWith } from "../../../services/halo/fakes/halo.fake.mjs";
import { aFakeDiscordServiceWith } from "../../../services/discord/fakes/discord.fake.mjs";
import type { DiscordService } from "../../../services/discord/discord.mjs";
import type { GuildConfigRow } from "../../../services/database/types/guild_config.mjs";
import { aFakeGuildConfigRow } from "../../../services/database/fakes/database.fake.mjs";

const stockpileMatch: MatchStats<GameVariantCategory.MultiplayerStockpile> = {
  MatchId: "test-stockpile-match",
  MatchInfo: {
    StartTime: "2024-11-26T10:36:33.841Z",
    EndTime: "2024-11-26T10:47:32.093Z",
    Duration: "PT10M58.2413691S",
    LifecycleMode: 1,
    GameVariantCategory: GameVariantCategory.MultiplayerStockpile,
    LevelId: "1216247c-bf6d-4740-8270-e800a114f231",
    MapVariant: { AssetKind: 2, AssetId: "test-map", VersionId: "v1" },
    UgcGameVariant: { AssetKind: 6, AssetId: "test-variant", VersionId: "v1" },
    ClearanceId: "test-clearance",
    Playlist: null,
    PlaylistExperience: null,
    PlaylistMapModePair: null,
    SeasonId: undefined,
    PlayableDuration: "PT10M58.25S",
    TeamsEnabled: true,
    TeamScoringEnabled: true,
    GameplayInteraction: 1,
  },
  Teams: [
    {
      TeamId: 0,
      Outcome: 2,
      Rank: 1,
      Stats: {
        CoreStats: {
          Score: 3,
          PersonalScore: 10380,
          RoundsWon: 3,
          RoundsLost: 0,
          RoundsTied: 0,
          Kills: 24,
          Deaths: 12,
          Assists: 8,
          KDA: 20,
          Suicides: 0,
          Betrayals: 0,
          AverageLifeDuration: "PT53.7S",
          GrenadeKills: 2,
          HeadshotKills: 10,
          MeleeKills: 1,
          PowerWeaponKills: 5,
          ShotsFired: 200,
          ShotsHit: 100,
          Accuracy: 0.5,
          DamageDealt: 5000,
          DamageTaken: 3000,
          Medals: [],
          CalloutAssists: 4,
          DriverAssists: 0,
          VehicleDestroys: 0,
        },
        StockpileStats: {
          PowerSeedsDeposited: 5,
          PowerSeedsStolen: 2,
          KillsAsPowerSeedCarrier: 3,
          PowerSeedCarriersKilled: 4,
          TimeAsPowerSeedCarrier: "PT2M30S",
          TimeAsPowerSeedDriver: "PT1M15S",
        },
      },
    },
  ],
  Players: [
    {
      PlayerId: "xuid(test-player)",
      PlayerType: 1,
      BotDifficulty: -1,
      TeamId: 0,
      Outcome: 2,
      Rank: 1,
      ParticipationInfo: {
        FirstJoinedTime: "2024-11-26T10:36:33.841Z",
        LastLeaveTime: null,
        PresentAtBeginning: true,
        JoinedInProgress: false,
        LeftInProgress: false,
        PresentAtCompletion: true,
        TimePlayed: "PT10M58.25S",
        ConfirmedParticipation: null,
      },
      PlayerTeamStats: [
        {
          TeamId: 0,
          Stats: {
            CoreStats: {
              Score: 3,
              PersonalScore: 2000,
              RoundsWon: 3,
              RoundsLost: 0,
              RoundsTied: 0,
              Kills: 12,
              Deaths: 6,
              Assists: 4,
              KDA: 10,
              Suicides: 0,
              Betrayals: 0,
              AverageLifeDuration: "PT45S",
              GrenadeKills: 1,
              HeadshotKills: 5,
              MeleeKills: 0,
              PowerWeaponKills: 2,
              ShotsFired: 100,
              ShotsHit: 50,
              Accuracy: 0.5,
              DamageDealt: 2500,
              DamageTaken: 1500,
              Medals: [],
              CalloutAssists: 2,
              DriverAssists: 0,
              VehicleDestroys: 0,
            },
            StockpileStats: {
              PowerSeedsDeposited: 3,
              PowerSeedsStolen: 1,
              KillsAsPowerSeedCarrier: 2,
              PowerSeedCarriersKilled: 2,
              TimeAsPowerSeedCarrier: "PT1M15S",
              TimeAsPowerSeedDriver: "PT30S",
            },
          },
        },
      ],
    },
  ],
} as unknown as MatchStats<GameVariantCategory.MultiplayerStockpile>;

const playerXuidsToGametags = new Map([["xuid(test-player)", "TestPlayer"]]);

describe("StockpileMatchEmbed", () => {
  const locale = "en-US";
  let discordService: DiscordService;
  let haloService: HaloService;
  let guildConfig: GuildConfigRow;
  let matchEmbed: StockpileMatchEmbed;

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    guildConfig = aFakeGuildConfigRow();
    matchEmbed = new StockpileMatchEmbed({ discordService, haloService, guildConfig, locale });
  });

  describe("getEmbed", () => {
    it("returns the expected embed", async () => {
      const result = await matchEmbed.getEmbed(stockpileMatch, playerXuidsToGametags);
      expect(result).toMatchSnapshot();
    });
  });
});
