import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { BaseCommand } from "../base/base.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { GameVariantCategory, MatchStats } from "halo-infinite-api";
import { QueueData } from "../../services/discord/discord.mjs";
import { inspect } from "util";
import { BaseMatchEmbed } from "./embeds/base-match-embed.mjs";
import { AttritionMatchEmbed } from "./embeds/attrition-match-embed.mjs";
import { CtfMatchEmbed } from "./embeds/ctf-match-embed.mjs";
import { EliminationMatchEmbed } from "./embeds/elimination-match-embed.mjs";
import { EscalationMatchEmbed } from "./embeds/escalation-match-embed.mjs";
import { ExtractionMatchEmbed } from "./embeds/extraction-match-embed.mjs";
import { FiestaMatchEmbed } from "./embeds/fiesta-match-embed.mjs";
import { FirefightMatchEmbed } from "./embeds/firefight-match-embed.mjs";
import { GrifballMatchEmbed } from "./embeds/grifball-match-embed.mjs";
import { InfectionMatchEmbed } from "./embeds/infection-match-embed.mjs";
import { KOTHMatchEmbed } from "./embeds/koth-match-embed.mjs";
import { LandGrabMatchEmbed } from "./embeds/land-grab-match-embed.mjs";
import { MinigameMatchEmbed } from "./embeds/minigame-match-embed.mjs";
import { OddballMatchEmbed } from "./embeds/oddball-match-embed.mjs";
import { SlayerMatchEmbed } from "./embeds/slayer-match-embed.mjs";
import { StockpileMatchEmbed } from "./embeds/stockpile-match-embed.mjs";
import { StrongholdsMatchEmbed } from "./embeds/strongholds-match-embed.mjs";
import { TotalControlMatchEmbed } from "./embeds/total-control-match-embed.mjs";
import { UnknownMatchEmbed } from "./embeds/unknown-match-embed.mjs";

const MATCH_ID_EXAMPLE = "d9d77058-f140-4838-8f41-1a3406b28566";

export class StatsCommand extends BaseCommand {
  data = new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Pulls stats from Halo waypoint")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("neatqueue")
        .setDescription("Pulls stats for a NeatQueue series result")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("The channel which has the NeatQueue result message")
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option.setName("queue").setDescription("The Queue number for the series").setRequired(true),
        )
        .addBooleanOption((option) =>
          option
            .setName("private")
            .setDescription("Only provide the response to you instead of the channel")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("match")
        .setDescription("Pulls stats for a specific match")
        .addStringOption((option) =>
          option
            .setName("id")
            .setDescription(`The match ID (example: ${MATCH_ID_EXAMPLE})`)
            .setRequired(true)
            .setMinLength(MATCH_ID_EXAMPLE.length)
            .setMaxLength(MATCH_ID_EXAMPLE.length),
        )
        .addBooleanOption((option) =>
          option
            .setName("private")
            .setDescription("Only provide the response to you instead of the channel")
            .setRequired(false),
        ),
    );

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    console.log(inspect(interaction, { depth: 10, colors: true, compact: false }));

    console.log(
      `StatsCommand execute from ${interaction.user.globalName ?? interaction.user.username}: ${interaction.options.getSubcommand()}`,
    );

    switch (interaction.options.getSubcommand()) {
      case "neatqueue":
        await this.handleNeatQueueSubCommand(interaction);
        break;
      case "match":
        await this.handleMatchSubCommand(interaction);
        break;
      default:
        await interaction.reply("Unknown subcommand");
        break;
    }
  }

  private async handleNeatQueueSubCommand(interaction: ChatInputCommandInteraction) {
    const channel = interaction.options.get("channel", true);
    const queue = interaction.options.get("queue", true);
    const ephemeral = interaction.options.getBoolean("private") ?? false;
    let deferred = false;

    try {
      const channelValue = Preconditions.checkExists(channel.channel);
      const queueValue = queue.value as number;

      await interaction.deferReply({ ephemeral });
      deferred = true;

      const queueData = await this.services.discordService.getTeamsFromQueue(
        Preconditions.checkExists(channel.channel),
        queueValue,
      );

      if (!queueData) {
        await interaction.editReply({
          content: `No queue found within the last 100 messages of <#${channelValue.id}>, with queue number ${queueValue.toString()}`,
        });

        return;
      }

      const series = await this.services.haloService.getSeriesFromDiscordQueue(queueData);
      const seriesEmbed = await this.createSeriesEmbed(queueData, queueValue, series);

      await interaction.editReply({
        embeds: [seriesEmbed],
      });

      /* Based on https://discordjs.guide/popular-topics/threads.html#thread-related-gateway-events
      * But threads is not available for channel here. Needs further investigation
      await Promise.all(series.map(async (match, index) => {
            const thread = await channel.threads.create({
                name: `Match ${index + 1} - Queue ${queueValue}`,
                autoArchiveDuration: 60,
                startMessage: mainMessage.id,
            });

            const matchEmbed = await this.createMatchEmbed(match);

            await thread.send({ embeds: [matchEmbed] });
        }));
        */
    } catch (error) {
      const reply = {
        content: `Failed to fetch (Channel: <#${channel.channel?.id ?? "unknown"}>, queue: ${queue.value?.toString() ?? "unknown"}): ${error instanceof Error ? error.message : "unknown"}`,
      };
      if (deferred) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply({ ...reply, ephemeral: true });
      }

      console.error(error);
    }
  }

  private async handleMatchSubCommand(interaction: ChatInputCommandInteraction) {
    const matchId = interaction.options.get("id", true);
    const ephemeral = interaction.options.getBoolean("private") ?? false;
    let deferred = false;

    try {
      await interaction.deferReply({ ephemeral });
      deferred = true;
      const matches = await this.services.haloService.getMatchDetails([matchId.value as string]);

      if (!matches.length) {
        await interaction.editReply({ content: "Match not found" });
        return;
      }

      const match = Preconditions.checkExists(matches[0]);
      const players = await this.services.haloService.getPlayerXuidsToGametags(match);

      const matchEmbed = this.getMatchEmbed(match);
      const embed = await matchEmbed.getEmbed(match, players);

      await interaction.editReply({
        embeds: [embed],
      });
    } catch (error) {
      const reply = {
        content: `Error: ${error instanceof Error ? error.message : "unknown"}`,
      };
      if (deferred) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply({ ...reply, ephemeral: true });
      }

      console.error(error);
    }
  }

  private addEmbedFields(embed: EmbedBuilder, titles: string[], data: string[][]) {
    for (let column = 0; column < titles.length; column++) {
      embed.addFields({
        name: Preconditions.checkExists(titles[column]),
        value: data
          .slice(1)
          .map((row) => row[column])
          .join("\n"),
        inline: true,
      });
    }
  }

  private async createSeriesEmbed(queueData: QueueData, queue: number, series: MatchStats[]) {
    const { haloService } = this.services;
    const titles = ["Game", "Duration", "Score"];
    const tableData = [titles];
    for (const seriesMatch of series) {
      const gameTypeAndMap = await haloService.getGameTypeAndMap(seriesMatch);
      const gameDuration = haloService.getReadableDuration(seriesMatch.MatchInfo.Duration);
      const gameScore = haloService.getGameScore(seriesMatch);

      tableData.push([gameTypeAndMap, gameDuration, gameScore]);
    }

    const guildId = Preconditions.checkExists(queueData.message.guildId);
    const channelId = Preconditions.checkExists(queueData.message.channelId);
    const messageId = Preconditions.checkExists(queueData.message.id);
    const embed = new EmbedBuilder()
      .setTitle(`Series stats for queue #${queue.toString()}`)
      .setURL(`https://discord.com/channels/${guildId}/${channelId}/${messageId}`)
      .setColor("DarkBlue");

    this.addEmbedFields(embed, titles, tableData);

    return embed;
  }

  private getMatchEmbed(match: MatchStats): BaseMatchEmbed<GameVariantCategory> {
    const { haloService } = this.services;

    switch (match.MatchInfo.GameVariantCategory) {
      case GameVariantCategory.MultiplayerAttrition:
        return new AttritionMatchEmbed(haloService);
      case GameVariantCategory.MultiplayerCtf:
        return new CtfMatchEmbed(haloService);
      case GameVariantCategory.MultiplayerElimination:
        return new EliminationMatchEmbed(haloService);
      case GameVariantCategory.MultiplayerEscalation:
        return new EscalationMatchEmbed(haloService);
      case GameVariantCategory.MultiplayerExtraction:
        return new ExtractionMatchEmbed(haloService);
      case GameVariantCategory.MultiplayerFiesta:
        return new FiestaMatchEmbed(haloService);
      case GameVariantCategory.MultiplayerFirefight:
        return new FirefightMatchEmbed(haloService);
      case GameVariantCategory.MultiplayerGrifball:
        return new GrifballMatchEmbed(haloService);
      case GameVariantCategory.MultiplayerInfection:
        return new InfectionMatchEmbed(haloService);
      case GameVariantCategory.MultiplayerKingOfTheHill:
        return new KOTHMatchEmbed(haloService);
      case GameVariantCategory.MultiplayerLandGrab:
        return new LandGrabMatchEmbed(haloService);
      case GameVariantCategory.MultiplayerMinigame:
        return new MinigameMatchEmbed(haloService);
      case GameVariantCategory.MultiplayerOddball:
        return new OddballMatchEmbed(haloService);
      case GameVariantCategory.MultiplayerSlayer:
        return new SlayerMatchEmbed(haloService);
      case GameVariantCategory.MultiplayerStockpile:
        return new StockpileMatchEmbed(haloService);
      case GameVariantCategory.MultiplayerStrongholds:
        return new StrongholdsMatchEmbed(haloService);
      case GameVariantCategory.MultiplayerTotalControl:
        return new TotalControlMatchEmbed(haloService);
      default:
        return new UnknownMatchEmbed(haloService);
    }
  }
}
