import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import { BaseCommand } from "../base/base.mjs";
import { Preconditions } from "../../utils/preconditions.mjs";

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

      await interaction.deferReply({ ephemeral: true });

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
      const seriesScores = series.map((match) => match.Teams.map((team) => team.Outcome).join(":")).join(", ");

      await interaction.editReply({
        content: `Channel: <#${channelValue.id}>, queue: ${queueValue.toString()}\n\n${seriesScores}`,
      });
    } catch (error) {
      await interaction.editReply({
        content: `Failed to fetch (Channel: <#${channel.channel?.id ?? "unknown"}>, queue: ${queue.value?.toString() ?? "unknown"}): ${error instanceof Error ? error.message : "unknown"}`,
      });
    }
  }
}
