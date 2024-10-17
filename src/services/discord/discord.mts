import {
  APIInteractionDataResolvedChannel,
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  GuildBasedChannel,
  Message,
  TextChannel,
  User,
} from "discord.js";
import { BaseCommand } from "../../commands/base/base.mjs";
import { config } from "../../config.mjs";
import { Preconditions } from "../../utils/preconditions.mjs";

const NEAT_QUEUE_BOT_USER_ID = "857633321064595466";

export interface QueueData {
  message: Message;
  timestamp: Date;
  teams: {
    name: string;
    players: User[];
  }[];
}

export class DiscordService {
  readonly client = new Client({ intents: [GatewayIntentBits.Guilds] });

  async activate(commands: Collection<string, BaseCommand>) {
    this.client.once(Events.ClientReady, (readyClient) => {
      console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    });

    this.addEventHandlers(commands);

    await this.client.login(config.DISCORD_TOKEN);
  }

  async getTeamsFromQueue(
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
    const playerIdToUserMap = new Map<string, User>();
    for (const playerId of playerIds) {
      const user = await this.getUserInfo(playerId);
      playerIdToUserMap.set(playerId, user);
    }

    return {
      message: queueMessage,
      timestamp: new Date(Preconditions.checkExists(data.timestamp, "No timestamp found")),
      teams: fields.map((field) => ({
        name: field.name,
        players: this.extractUserIds(field.value).map((id) => Preconditions.checkExists(playerIdToUserMap.get(id))),
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

  private async getUserInfo(userId: string): Promise<User> {
    return await this.client.users.fetch(userId);
  }

  private addEventHandlers(commands: Collection<string, BaseCommand>) {
    this.client.on(Events.InteractionCreate, (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = commands.get(interaction.commandName);

      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      try {
        void command.execute(interaction);
      } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
          void interaction.followUp({ content: "There was an error while executing this command!", ephemeral: true });
        } else {
          void interaction.reply({ content: "There was an error while executing this command!", ephemeral: true });
        }
      }
    });
  }
}
