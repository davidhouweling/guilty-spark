import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import { BaseCommand } from "../base/base.mjs";
import { Preconditions } from "../../utils/preconditions.mjs";
import { MatchStats } from "halo-infinite-api";
import { QueueData } from "../../services/discord/discord.mjs";

export class StatsCommand extends BaseCommand {
  data = new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Pulls stats")
    .addChannelOption((option) =>
      option.setName("channel").setDescription("The channel to echo into").setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName("queue").setDescription("The Queue number for the series").setRequired(true),
    );

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const channel = interaction.options.get("channel", true);
    const queue = interaction.options.get("queue", true);

    try {
      console.log(`StatsCommand execute from ${interaction.user.globalName ?? interaction.user.username}`);
      const channelValue = Preconditions.checkExists(channel.channel);
      const queueValue = queue.value as number;

      await interaction.deferReply();

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

      console.log(`Queue data: ${JSON.stringify(queueData)}`);

      const series = await this.services.haloService.getSeriesFromDiscordQueue(queueData);

      await interaction.editReply({
        embeds: [await this.createEmbed(queueData, queueValue, series)],
      });
    } catch (error) {
      await interaction.editReply({
        content: `Failed to fetch (Channel: <#${channel.channel?.id ?? "unknown"}>, queue: ${queue.value?.toString() ?? "unknown"}): ${error instanceof Error ? error.message : "unknown"}`,
      });
    }
  }

  private async createEmbed(queueData: QueueData, queue: number, series: MatchStats[]) {
    const { haloService } = this.services;
    const titles = ["Game", "Duration", "Score"];
    const tableData = [titles];
    for (const seriesMatch of series) {
      const gameTypeAndMap = await haloService.getGameTypeAndMap(seriesMatch);
      const gameDuration = haloService.getGameDuration(seriesMatch);
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

    for (let column = 0; column < titles.length; column++) {
      embed.addFields({
        name: Preconditions.checkExists(titles[column]),
        value: tableData
          .slice(1)
          .map((row) => row[column])
          .join("\n"),
        inline: true,
      });
    }

    return embed;
  }
}
