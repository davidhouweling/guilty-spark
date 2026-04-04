import { GameVariantCategory } from "halo-infinite-api";
import type { GuildConfigRow } from "../../services/database/types/guild_config";
import type { DiscordService } from "../../services/discord/discord";
import type { HaloService } from "../../services/halo/halo";
import { AttritionMatchEmbed } from "./attrition-match-embed";
import type { BaseMatchEmbed } from "./base-match-embed";
import { CtfMatchEmbed } from "./ctf-match-embed";
import { EliminationMatchEmbed } from "./elimination-match-embed";
import { EscalationMatchEmbed } from "./escalation-match-embed";
import { ExtractionMatchEmbed } from "./extraction-match-embed";
import { FiestaMatchEmbed } from "./fiesta-match-embed";
import { FirefightMatchEmbed } from "./firefight-match-embed";
import { GrifballMatchEmbed } from "./grifball-match-embed";
import { InfectionMatchEmbed } from "./infection-match-embed";
import { KOTHMatchEmbed } from "./koth-match-embed";
import { LandGrabMatchEmbed } from "./land-grab-match-embed";
import { MinigameMatchEmbed } from "./minigame-match-embed";
import { OddballMatchEmbed } from "./oddball-match-embed";
import { SlayerMatchEmbed } from "./slayer-match-embed";
import { StockpileMatchEmbed } from "./stockpile-match-embed";
import { StrongholdsMatchEmbed } from "./strongholds-match-embed";
import { TotalControlMatchEmbed } from "./total-control-match-embed";
import { UnknownMatchEmbed } from "./unknown-match-embed";
import { VIPMatchEmbed } from "./vip-match-embed";

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
