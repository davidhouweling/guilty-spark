import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  GuildBasedChannel,
  APIInteractionDataResolvedChannel,
  TextChannel,
} from "discord.js";
import { BaseCommand } from "../base/base.mjs";
import { Preconditions } from "../../utils/preconditions.mjs";

const NEAT_QUEUE_BOT_USER_ID = "857633321064595466";

interface QueueData {
  timestamp: Date;
  teams: {
    name: string;
    players: { id: string; username: string }[];
  }[];
}

export class StatsCommand extends BaseCommand {
  data = new SlashCommandBuilder()
    .setName("zz-test-stats")
    .setDescription("Pulls stats")
    .addChannelOption((option) =>
      option.setName("channel").setDescription("The channel to echo into").setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName("queue").setDescription("The Queue number for the series").setRequired(true),
    );

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      const channel = interaction.options.get("channel", true);
      const queue = interaction.options.get("queue", true);
      const channelValue = Preconditions.checkExists(channel.channel);
      const queueValue = queue.value as number;

      await interaction.deferReply({ ephemeral: true });

      const queueMessage = await this.getTeamsFromQueue(Preconditions.checkExists(channel.channel), queueValue);

      if (!queueMessage) {
        await interaction.editReply({
          content: `No queue found within the last 100 messages of <#${channelValue.id}>, with queue number ${queueValue.toString()}`,
        });

        return;
      }

      await interaction.editReply({
        content: `Channel: <#${channelValue.id}>, queue: ${queueValue.toString()}\n\n${JSON.stringify(queueMessage)}`,
      });
    } catch (error) {
      await interaction.editReply({
        content: `Failed to fetch: ${error instanceof Error ? error.message : "unknown"}`,
      });
    }
  }

  private async getTeamsFromQueue(
    channel: GuildBasedChannel | APIInteractionDataResolvedChannel,
    queue: number,
  ): Promise<QueueData | null> {
    if (!(channel instanceof TextChannel)) {
      throw new Error("Unexpected channel type");
    }

    const messages = await channel.messages.fetch({ limit: 100 });
    const queueMessage = messages
      .filter((message) => message.author.bot && message.author.id === NEAT_QUEUE_BOT_USER_ID)
      .find((message) => message.embeds.find((embed) => embed.title?.includes(`#${queue.toString()}`)));
    if (!queueMessage) {
      return null;
    }

    const data = queueMessage.embeds[0]?.data;

    if (!data) {
      throw new Error("Found queue message but unable to process data (no data)");
    }

    const fields = Preconditions.checkExists(data.fields, "No fields found");
    const playerIds = fields.flatMap((field) => this.extractUserIds(field.value));
    const playerIdToUserNameMap = new Map<string, string>();
    for (const playerId of playerIds) {
      const username = await this.getUsername(playerId);
      playerIdToUserNameMap.set(playerId, username);
    }

    return {
      timestamp: new Date(Preconditions.checkExists(data.timestamp, "No timestamp found")),
      teams: fields.map((field) => ({
        name: field.name,
        players: this.extractUserIds(field.value).map((id) => ({
          id,
          username: Preconditions.checkExists(playerIdToUserNameMap.get(id)),
        })),
      })),
    };
  }

  private extractUserIds(message: string): string[] {
    const regex = /<@(\d+)>/g;
    const ids: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(message)) !== null) {
      if (match[1]) {
        ids.push(match[1]);
      }
    }

    return ids;
  }

  private async getUsername(userId: string): Promise<string> {
    const user = await this.services.discordService.client.users.fetch(userId);
    return user.username;
  }
}
