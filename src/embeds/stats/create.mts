import { GameVariantCategory } from "halo-infinite-api";
import type { GuildConfigRow } from "../../services/database/types/guild_config.mjs";
import type { DiscordService } from "../../services/discord/discord.mjs";
import type { HaloService } from "../../services/halo/halo.mjs";
import { AttritionMatchEmbed } from "./attrition-match-embed.mjs";
import type { BaseMatchEmbed } from "./base-match-embed.mjs";
import { CtfMatchEmbed } from "./ctf-match-embed.mjs";
import { EliminationMatchEmbed } from "./elimination-match-embed.mjs";
import { EscalationMatchEmbed } from "./escalation-match-embed.mjs";
import { ExtractionMatchEmbed } from "./extraction-match-embed.mjs";
import { FiestaMatchEmbed } from "./fiesta-match-embed.mjs";
import { FirefightMatchEmbed } from "./firefight-match-embed.mjs";
import { GrifballMatchEmbed } from "./grifball-match-embed.mjs";
import { InfectionMatchEmbed } from "./infection-match-embed.mjs";
import { KOTHMatchEmbed } from "./koth-match-embed.mjs";
import { LandGrabMatchEmbed } from "./land-grab-match-embed.mjs";
import { MinigameMatchEmbed } from "./minigame-match-embed.mjs";
import { OddballMatchEmbed } from "./oddball-match-embed.mjs";
import { SlayerMatchEmbed } from "./slayer-match-embed.mjs";
import { StockpileMatchEmbed } from "./stockpile-match-embed.mjs";
import { StrongholdsMatchEmbed } from "./strongholds-match-embed.mjs";
import { TotalControlMatchEmbed } from "./total-control-match-embed.mjs";
import { UnknownMatchEmbed } from "./unknown-match-embed.mjs";
import { VIPMatchEmbed } from "./vip-match-embed.mjs";

interface EmbedCreateOpts {
  discordService: DiscordService;
  haloService: HaloService;
  guildConfig: GuildConfigRow;
  gameVariantCategory: GameVariantCategory;
  locale: string;
}

export function create({
  discordService,
  haloService,
  guildConfig,
  gameVariantCategory,
  locale,
}: EmbedCreateOpts): BaseMatchEmbed<GameVariantCategory> {
  const opts = {
    discordService,
    haloService,
    guildConfig,
    locale,
  };

  switch (gameVariantCategory) {
    case GameVariantCategory.MultiplayerAttrition: {
      return new AttritionMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerCtf: {
      return new CtfMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerElimination: {
      return new EliminationMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerEscalation: {
      return new EscalationMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerExtraction: {
      return new ExtractionMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerFiesta: {
      return new FiestaMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerFirefight: {
      return new FirefightMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerGrifball: {
      return new GrifballMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerInfection: {
      return new InfectionMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerKingOfTheHill: {
      return new KOTHMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerLandGrab: {
      return new LandGrabMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerMinigame: {
      return new MinigameMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerOddball: {
      return new OddballMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerSlayer: {
      return new SlayerMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerStockpile: {
      return new StockpileMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerStrongholds: {
      return new StrongholdsMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerTotalControl: {
      return new TotalControlMatchEmbed(opts);
    }
    case GameVariantCategory.MultiplayerVIP: {
      return new VIPMatchEmbed(opts);
    }
    default: {
      return new UnknownMatchEmbed(opts);
    }
  }
}
