import type {
  APIEmbed,
  APIEmbedField,
  APIMessageTopLevelComponent,
  APIButtonComponentWithCustomId,
} from "discord-api-types/v10";
import { ButtonStyle, ComponentType } from "discord-api-types/v10";
import type { DiscordService } from "../../services/discord/discord.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { AssociationReason, GamesRetrievable } from "../../services/database/types/discord_associations.mjs";
import type { DiscordAssociationsRow } from "../../services/database/types/discord_associations.mjs";
import { BaseTableEmbed } from "../base-table-embed.mjs";
import { EmbedColors } from "../colors.mjs";
import { MapsPostType } from "../../services/database/types/guild_config.mjs";
import type { HaloService } from "../../services/halo/halo.mjs";

interface NeatQueuePlayersEmbedServices {
  discordService: DiscordService;
  haloService: HaloService;
}

export interface PlayerData {
  id: string;
  name: string;
}

export interface NeatQueuePlayersEmbedData {
  players: PlayerData[];
  discordAssociations: DiscordAssociationsRow[];
  haloPlayersMap: Map<string, { gamertag: string; xuid: string }>;
  rankedArenaCsrs: Map<string, { Current: RankData; AllTimeMax: RankData }>;
  esras: Map<string, number>;
  mapsPostType: MapsPostType;
}

interface RankData {
  Value: number;
  Tier: string;
  SubTier: number;
  MeasurementMatchesRemaining: number;
  InitialMeasurementMatches: number;
}

export class NeatQueuePlayersEmbed extends BaseTableEmbed {
  private readonly services: NeatQueuePlayersEmbedServices;
  private readonly data: NeatQueuePlayersEmbedData;

  constructor(services: NeatQueuePlayersEmbedServices, data: NeatQueuePlayersEmbedData) {
    super();
    this.services = services;
    this.data = data;
  }

  get embed(): APIEmbed {
    const { players, discordAssociations, haloPlayersMap, rankedArenaCsrs } = this.data;
    const { discordService } = this.services;

    const sortedPlayers = [...players].sort((a, b) => a.name.localeCompare(b.name));
    const titles = ["Player", "Halo Profile", "Current Rank (ESRA, ATP)"];
    const tableData: string[][] = [];

    for (const player of sortedPlayers) {
      const association = discordAssociations.find((assoc) => assoc.DiscordId === player.id);
      if (association?.XboxId == null || !haloPlayersMap.has(association.XboxId)) {
        tableData.push([`<@${player.id}>`, "*Not Connected*", "*-*"]);
        continue;
      }

      const rankData = rankedArenaCsrs.get(association.XboxId);
      const haloPlayer = haloPlayersMap.get(association.XboxId);
      const gamertag = haloPlayer?.gamertag;

      if (gamertag == null) {
        tableData.push([`<@${player.id}>`, "*Not Connected*", "*-*"]);
        continue;
      }

      const url = new URL(`https://halodatahive.com/Player/Infinite/${gamertag}`);
      const gamertagUrl = `[${gamertag}](${url.href})${
        association.AssociationReason === AssociationReason.GAME_SIMILARITY &&
        association.GamesRetrievable !== GamesRetrievable.YES
          ? "*"
          : ""
      }`;

      if (!rankData) {
        tableData.push([`<@${player.id}>`, gamertagUrl, "-"]);
        continue;
      }

      const getRank = (value: number): string => (value >= 0 ? value.toString() : "-");
      const { Current, AllTimeMax } = rankData;
      const currentRank = getRank(Current.Value);
      const currentRankEmoji = discordService.getRankEmoji({
        rankTier: Current.Tier,
        subTier: Current.SubTier,
        measurementMatchesRemaining: Current.MeasurementMatchesRemaining,
        initialMeasurementMatches: Current.InitialMeasurementMatches,
      });
      const allTimePeakRank = getRank(AllTimeMax.Value);
      const allTimePeakRankEmoji = discordService.getRankEmoji({
        rankTier: AllTimeMax.Tier,
        subTier: AllTimeMax.SubTier,
        measurementMatchesRemaining: AllTimeMax.MeasurementMatchesRemaining,
        initialMeasurementMatches: AllTimeMax.InitialMeasurementMatches,
      });

      tableData.push([
        `<@${player.id}>`,
        gamertagUrl,
        `${currentRankEmoji}${currentRank} (${this.formatEsra(this.data.esras.get(association.XboxId) ?? 0)}, ${allTimePeakRankEmoji}${allTimePeakRank})`,
      ]);
    }

    const fields: APIEmbedField[] = [];
    for (let column = 0; column < titles.length; column++) {
      fields.push({
        name: Preconditions.checkExists(titles[column]),
        value: tableData.map((row) => row[column] ?? "‎ ").join("\n"),
        inline: true,
      });
    }

    const hasGuessedGamertags = discordAssociations.some(
      (association) =>
        association.AssociationReason === AssociationReason.GAME_SIMILARITY &&
        association.GamesRetrievable !== GamesRetrievable.YES,
    );

    return {
      title: "Players in queue",
      description: `-# Legend: ESRA = expected skill rank average | ATP = all time peak${hasGuessedGamertags ? " | * = guessed gamertag" : ""}`,
      color: EmbedColors.INFO,
      fields,
      footer: {
        text: "Something not right? Click the 'Connect my Halo account' button below to connect your Halo account.",
      },
    };
  }

  get actions(): APIMessageTopLevelComponent[] {
    const { mapsPostType } = this.data;
    const buttons: APIButtonComponentWithCustomId[] = [
      {
        type: ComponentType.Button,
        style: ButtonStyle.Primary,
        label: "Connect my Halo account",
        custom_id: "btn_connect_initiate",
        emoji: {
          name: "🔗",
        },
      },
    ];

    if (mapsPostType === MapsPostType.BUTTON) {
      buttons.push({
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        label: "Generate maps",
        custom_id: "btn_maps_initiate",
        emoji: {
          name: "🗺️",
        },
      });
    }

    return [
      {
        type: ComponentType.ActionRow,
        components: buttons,
      },
    ];
  }

  private formatEsra(esra: number): string {
    const { discordService, haloService } = this.services;

    if (esra <= 0) {
      return "-";
    }

    const roundedEsra = Math.round(esra);
    const { rankTier, subTier } = haloService.getRankTierFromCsr(roundedEsra);
    const esraEmoji = discordService.getRankEmoji({
      rankTier,
      subTier,
      measurementMatchesRemaining: 0,
      initialMeasurementMatches: 0,
    });

    return `${esraEmoji}${roundedEsra.toString()}`;
  }
}
