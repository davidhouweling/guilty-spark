import { describe, beforeEach, it, expect } from "vitest";
import { GameVariantCategory } from "halo-infinite-api";
import { create } from "../create";
import { aFakeDiscordServiceWith } from "../../../services/discord/fakes/discord.fake";
import { aFakeHaloServiceWith } from "../../../services/halo/fakes/halo.fake";
import { aFakeGuildConfigRow } from "../../../services/database/fakes/database.fake";
import type { DiscordService } from "../../../services/discord/discord";
import type { HaloService } from "../../../services/halo/halo";
import type { GuildConfigRow } from "../../../services/database/types/guild_config";
import { AttritionMatchEmbed } from "../attrition-match-embed";
import { CtfMatchEmbed } from "../ctf-match-embed";
import { EliminationMatchEmbed } from "../elimination-match-embed";
import { EscalationMatchEmbed } from "../escalation-match-embed";
import { ExtractionMatchEmbed } from "../extraction-match-embed";
import { FiestaMatchEmbed } from "../fiesta-match-embed";
import { FirefightMatchEmbed } from "../firefight-match-embed";
import { GrifballMatchEmbed } from "../grifball-match-embed";
import { InfectionMatchEmbed } from "../infection-match-embed";
import { KOTHMatchEmbed } from "../koth-match-embed";
import { LandGrabMatchEmbed } from "../land-grab-match-embed";
import { MinigameMatchEmbed } from "../minigame-match-embed";
import { OddballMatchEmbed } from "../oddball-match-embed";
import { SlayerMatchEmbed } from "../slayer-match-embed";
import { StockpileMatchEmbed } from "../stockpile-match-embed";
import { StrongholdsMatchEmbed } from "../strongholds-match-embed";
import { TotalControlMatchEmbed } from "../total-control-match-embed";
import { UnknownMatchEmbed } from "../unknown-match-embed";
import { VIPMatchEmbed } from "../vip-match-embed";

describe("create", () => {
  const locale = "en-US";
  let discordService: DiscordService;
  let haloService: HaloService;
  let guildConfig: GuildConfigRow;

  beforeEach(() => {
    discordService = aFakeDiscordServiceWith();
    haloService = aFakeHaloServiceWith();
    guildConfig = aFakeGuildConfigRow();
  });

  it("returns AttritionMatchEmbed for MultiplayerAttrition", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerAttrition,
      locale,
    });

    expect(embed).toBeInstanceOf(AttritionMatchEmbed);
  });

  it("returns CtfMatchEmbed for MultiplayerCtf", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerCtf,
      locale,
    });

    expect(embed).toBeInstanceOf(CtfMatchEmbed);
  });

  it("returns EliminationMatchEmbed for MultiplayerElimination", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerElimination,
      locale,
    });

    expect(embed).toBeInstanceOf(EliminationMatchEmbed);
  });

  it("returns EscalationMatchEmbed for MultiplayerEscalation", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerEscalation,
      locale,
    });

    expect(embed).toBeInstanceOf(EscalationMatchEmbed);
  });

  it("returns ExtractionMatchEmbed for MultiplayerExtraction", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerExtraction,
      locale,
    });

    expect(embed).toBeInstanceOf(ExtractionMatchEmbed);
  });

  it("returns FiestaMatchEmbed for MultiplayerFiesta", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerFiesta,
      locale,
    });

    expect(embed).toBeInstanceOf(FiestaMatchEmbed);
  });

  it("returns FirefightMatchEmbed for MultiplayerFirefight", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerFirefight,
      locale,
    });

    expect(embed).toBeInstanceOf(FirefightMatchEmbed);
  });

  it("returns GrifballMatchEmbed for MultiplayerGrifball", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerGrifball,
      locale,
    });

    expect(embed).toBeInstanceOf(GrifballMatchEmbed);
  });

  it("returns InfectionMatchEmbed for MultiplayerInfection", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerInfection,
      locale,
    });

    expect(embed).toBeInstanceOf(InfectionMatchEmbed);
  });

  it("returns KOTHMatchEmbed for MultiplayerKingOfTheHill", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerKingOfTheHill,
      locale,
    });

    expect(embed).toBeInstanceOf(KOTHMatchEmbed);
  });

  it("returns LandGrabMatchEmbed for MultiplayerLandGrab", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerLandGrab,
      locale,
    });

    expect(embed).toBeInstanceOf(LandGrabMatchEmbed);
  });

  it("returns MinigameMatchEmbed for MultiplayerMinigame", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerMinigame,
      locale,
    });

    expect(embed).toBeInstanceOf(MinigameMatchEmbed);
  });

  it("returns OddballMatchEmbed for MultiplayerOddball", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerOddball,
      locale,
    });

    expect(embed).toBeInstanceOf(OddballMatchEmbed);
  });

  it("returns SlayerMatchEmbed for MultiplayerSlayer", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerSlayer,
      locale,
    });

    expect(embed).toBeInstanceOf(SlayerMatchEmbed);
  });

  it("returns StockpileMatchEmbed for MultiplayerStockpile", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerStockpile,
      locale,
    });

    expect(embed).toBeInstanceOf(StockpileMatchEmbed);
  });

  it("returns StrongholdsMatchEmbed for MultiplayerStrongholds", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerStrongholds,
      locale,
    });

    expect(embed).toBeInstanceOf(StrongholdsMatchEmbed);
  });

  it("returns TotalControlMatchEmbed for MultiplayerTotalControl", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerTotalControl,
      locale,
    });

    expect(embed).toBeInstanceOf(TotalControlMatchEmbed);
  });

  it("returns VIPMatchEmbed for MultiplayerVIP", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: GameVariantCategory.MultiplayerVIP,
      locale,
    });

    expect(embed).toBeInstanceOf(VIPMatchEmbed);
  });

  it("returns UnknownMatchEmbed for unknown game variant category", () => {
    const embed = create({
      discordService,
      haloService,
      guildConfig,
      gameVariantCategory: 999 as GameVariantCategory,
      locale,
    });

    expect(embed).toBeInstanceOf(UnknownMatchEmbed);
  });
});
