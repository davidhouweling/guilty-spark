import type { PlaylistCsr, PlaylistCsrContainer, ServiceRecord } from "halo-infinite-api";
import type { APIEmbed } from "discord-api-types/payloads/v10";
import { BaseTableEmbed } from "../base-table-embed.mjs";
import { EmbedColors } from "../colors.mjs";
import type { HaloService } from "../../services/halo/halo.mjs";
import { AssociationReason } from "../../services/database/types/discord_associations.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import type { DiscordService } from "../../services/discord/discord.mjs";

interface ServiceRecordEmbedServices {
  haloService: HaloService;
  discordService: DiscordService;
}

interface ServiceRecordEmbedData {
  locale: string;
  discordUserId: string;
  associationReason: AssociationReason;
  gamertag: string;
  serviceRecord: ServiceRecord;
  csr: PlaylistCsrContainer;
  esra: number;
}

export class ServiceRecordEmbed extends BaseTableEmbed {
  constructor(
    private readonly services: ServiceRecordEmbedServices,
    private readonly data: ServiceRecordEmbedData,
  ) {
    super();
  }

  get embed(): APIEmbed {
    const { haloService } = this.services;
    const { locale, discordUserId, associationReason, gamertag, serviceRecord, csr } = this.data;

    return {
      color: EmbedColors.INFO,
      title: `Service record`,
      description: [
        `**Discord user**: <@${discordUserId}>`,
        `**Xbox Gamertag:** ${gamertag}`,
        `**Association reason:** ${this.formatAssociationReason(associationReason)}`,
        "",
        `**Time played:** ${haloService.getReadableDuration(serviceRecord.TimePlayed, locale)}`,
        `**Matchmaking games completed:** ${serviceRecord.MatchesCompleted.toLocaleString(locale)}`,
        `**Wins : Losses : Ties:** ${serviceRecord.Wins.toLocaleString(locale)} : ${serviceRecord.Losses.toLocaleString(locale)} : ${serviceRecord.Ties.toLocaleString(locale)}`,
        `**Win percentage: ** ${this.formatStatValue((serviceRecord.Wins / Math.max(serviceRecord.MatchesCompleted, 1)) * 100)}%`,
        `**Total kills:deaths : assists (av KDA):** ${serviceRecord.CoreStats.Kills.toLocaleString(locale)} : ${serviceRecord.CoreStats.Deaths.toLocaleString(locale)} : ${serviceRecord.CoreStats.Assists.toLocaleString(locale)} (${serviceRecord.CoreStats.AverageKDA.toLocaleString(locale)})`,
        `**Total Damage D:T (D/T):** ${serviceRecord.CoreStats.DamageDealt.toLocaleString(locale)} : ${serviceRecord.CoreStats.DamageTaken.toLocaleString(locale)} (${this.formatDamageRatio(serviceRecord.CoreStats.DamageDealt, serviceRecord.CoreStats.DamageTaken)})`,
        "",
        `**Current Ranked Arena CSR:** ${this.formatCsr(csr.Current)}`,
        `**Season Peak Ranked Arena CSR:** ${this.formatCsr(csr.SeasonMax)}`,
        `**All Time Peak Ranked Arena CSR:** ${this.formatCsr(csr.AllTimeMax)}`,
        `**Expected Skill Rating Averaged - ESRA:** ${this.formatEsra(this.data.esra)}`,
      ].join("\n"),
    };
  }

  private formatStatValue(statValue: number): string {
    return Number.isSafeInteger(statValue)
      ? statValue.toLocaleString(this.data.locale)
      : Number(statValue.toFixed(2)).toLocaleString(this.data.locale);
  }

  private formatDamageRatio(damageDealt: number, damageTaken: number): string {
    if (damageDealt === 0) {
      return "0";
    }

    if (damageTaken === 0) {
      return "♾️";
    }

    return this.formatStatValue(damageDealt / damageTaken);
  }

  private formatAssociationReason(reason: AssociationReason): string {
    switch (reason) {
      case AssociationReason.CONNECTED: {
        return "Xbox Connected";
      }
      case AssociationReason.MANUAL: {
        return "Manually Connected";
      }
      case AssociationReason.USERNAME_SEARCH: {
        return "Username matched";
      }
      case AssociationReason.DISPLAY_NAME_SEARCH: {
        return "Display Name matched";
      }
      case AssociationReason.GAME_SIMILARITY: {
        return "Matched via games played";
      }
      case AssociationReason.UNKNOWN: {
        return "Unknown";
      }
      default: {
        throw new UnreachableError(reason);
      }
    }
  }

  private formatCsr(csr: PlaylistCsr): string {
    const { discordService } = this.services;
    const getRank = (value: number): string => (value >= 0 ? value.toString() : "-");
    const currentRank = getRank(csr.Value);
    const currentRankEmoji = discordService.getRankEmoji({
      rankTier: csr.Tier,
      subTier: csr.SubTier,
      measurementMatchesRemaining: csr.MeasurementMatchesRemaining,
      initialMeasurementMatches: csr.InitialMeasurementMatches,
    });
    return `${currentRankEmoji}${currentRank}`;
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
