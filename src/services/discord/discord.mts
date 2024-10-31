import { verifyKey } from "discord-interactions";
import {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIApplicationCommandSubcommandOption,
  APIInteraction,
  APIInteractionResponse,
  APIMessage,
  APIUser,
  APIVersion,
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  RESTGetAPIUserResult,
  RESTGetAPIWebhookWithTokenMessageResult,
  RESTPatchAPIChannelMessageJSONBody,
  RESTPatchAPIChannelMessageResult,
  RESTPostAPIChannelMessageJSONBody,
  RESTPostAPIChannelMessageResult,
  RESTPostAPIChannelThreadsResult,
  Routes,
} from "discord-api-types/v10";
import { JsonResponse } from "./json-response.mjs";
import { BaseCommand } from "../../commands/base/base.mjs";
import { Preconditions } from "../../base/preconditions.mjs";

const NEAT_QUEUE_BOT_USER_ID = "857633321064595466";

export interface QueueData {
  message: APIMessage;
  timestamp: Date;
  teams: {
    name: string;
    players: APIUser[];
  }[];
}

export interface SubcommandData {
  type: "SUBCOMMAND_DATA";
  name: string;
  options: APIApplicationCommandInteractionDataBasicOption[] | undefined;
  mappedOptions: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]> | undefined;
}

// originally this was built to wrap discord.js and use the provided client
// but in a move to make it work with Cloud Workers (such as Cloudflare Workers or AWS Lambda)
// replacing the outer workings with the expectations of discord HTTP interactions
// but keep the underlying logic the same, so this acts to transform between the two
export class DiscordService {
  private commands: Map<string, BaseCommand> | undefined = undefined;

  constructor(private readonly env: Env) {}

  setCommands(commands: Map<string, BaseCommand>) {
    this.commands = commands;
  }

  async verifyDiscordRequest(request: Request) {
    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    const body = await request.text();
    const isValidRequest =
      signature && timestamp && (await verifyKey(body, signature, timestamp, this.env.DISCORD_PUBLIC_KEY));
    if (!isValidRequest) {
      return { isValid: false };
    }

    try {
      const parsedInteraction = JSON.parse(body) as APIInteraction;
      return { interaction: parsedInteraction, isValid: true };
    } catch (error) {
      console.error(error);
      return { isValid: false, error: "Invalid JSON" };
    }
  }

  handleInteraction(interaction: APIInteraction) {
    switch (interaction.type) {
      case InteractionType.Ping: {
        return new JsonResponse({
          type: InteractionResponseType.Pong,
        });
      }
      case InteractionType.ApplicationCommand: {
        if (!this.commands) {
          return new JsonResponse({ error: "No commands found" }, { status: 500 });
        }

        const command = this.commands.get(interaction.data.name);
        if (!command) {
          return new JsonResponse({ error: "Command not found" }, { status: 404 });
        }

        return new JsonResponse(command.execute(interaction));
      }
      default: {
        return new JsonResponse({ error: "Unknown Type" }, { status: 400 });
      }
    }
  }

  extractSubcommand(
    interaction: APIApplicationCommandInteraction,
    name: string,
  ): SubcommandData | APIInteractionResponse {
    if (interaction.data.type !== ApplicationCommandType.ChatInput) {
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: "Invalid interaction type.", flags: MessageFlags.Ephemeral },
      };
    }
    if (interaction.data.name !== name) {
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: "Unexpected interaction routing.", flags: MessageFlags.Ephemeral },
      };
    }
    const subcommand = interaction.data.options?.[0] as APIApplicationCommandSubcommandOption | undefined;
    if (!subcommand) {
      return {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: "Missing subcommand", flags: MessageFlags.Ephemeral },
      };
    }

    const options = subcommand.options as APIApplicationCommandInteractionDataBasicOption[] | undefined;
    return {
      type: "SUBCOMMAND_DATA",
      name: subcommand.name,
      options: options,
      mappedOptions: options?.reduce((acc, option) => {
        acc.set(option.name, option.value);
        return acc;
      }, new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>()),
    };
  }

  async getTeamsFromQueue(channel: string, queue: number): Promise<QueueData | null> {
    const messages = await this.fetch<APIMessage[]>(Routes.channelMessages(channel), { limit: 100 });
    const queueMessage = messages
      .filter((message) => message.author.bot && message.author.id === NEAT_QUEUE_BOT_USER_ID)
      .find((message) => message.embeds.find((embed) => embed.title?.includes(`#${queue.toString()}`)));
    if (!queueMessage) {
      return null;
    }

    const embed = Preconditions.checkExists(queueMessage.embeds[0], "No embed found");
    const fields = Preconditions.checkExists(embed.fields, "No fields found");
    const playerIds = fields.flatMap((field) => this.extractUserIds(field.value));
    const playerIdToUserMap = new Map<string, APIUser>();
    for (const playerId of playerIds) {
      const user = await this.getUserInfo(playerId);
      playerIdToUserMap.set(playerId, user);
    }

    return {
      message: queueMessage,
      timestamp: new Date(Preconditions.checkExists(embed.timestamp, "No timestamp found")),
      teams: fields.map((field) => ({
        name: field.name,
        players: this.extractUserIds(field.value).map((id) => Preconditions.checkExists(playerIdToUserMap.get(id))),
      })),
    };
  }

  async updateDeferredReply(interactionToken: string, data: RESTPatchAPIChannelMessageJSONBody) {
    console.log("Getting message from interaction token", interactionToken);
    const message = await this.getMessageFromInteractionToken(interactionToken);
    console.log("Got message from interaction token", message);

    const jsonResponse = new JsonResponse(data);
    console.log("Updating deferred reply", jsonResponse);
    const response = await this.fetch<RESTPatchAPIChannelMessageResult>(
      Routes.webhookMessage(this.env.DISCORD_APP_ID, interactionToken, message.id),
      {},
      { method: "PATCH", body: await jsonResponse.text(), headers: jsonResponse.headers },
    );
    console.log("Updated deferred reply", response);
    return response;
  }

  getMessageFromInteractionToken(interactionToken: string) {
    return this.fetch<RESTGetAPIWebhookWithTokenMessageResult>(
      Routes.webhookMessage(this.env.DISCORD_APP_ID, interactionToken),
    );
  }

  createMessage(channel: string, data: RESTPostAPIChannelMessageJSONBody) {
    return this.fetch<RESTPostAPIChannelMessageResult>(
      Routes.channelMessages(channel),
      {},
      { method: "POST", body: JSON.stringify(data) },
    );
  }

  startThreadFromMessage(channel: string, message: string, name: string, autoArchiveDuration = 60) {
    return this.fetch<RESTPostAPIChannelThreadsResult>(
      Routes.threads(channel, message),
      {},
      { method: "POST", body: JSON.stringify({ name, auto_archive_duration: autoArchiveDuration }) },
    );
  }

  private async fetch<T>(
    path: string,
    queryParameters: Record<string, string | number> = {},
    fetchOptions: RequestInit = {},
  ) {
    const url = new URL(path, `https://discord.com/api/v${APIVersion}`);
    for (const [key, value] of Object.entries(queryParameters)) {
      url.searchParams.set(key, value.toString());
    }

    const response = await fetch(url.toString(), {
      ...fetchOptions,
      headers: {
        Authorization: `Bot ${this.env.DISCORD_TOKEN}`,
        ...fetchOptions.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch data from Discord API: ${response.status.toString()} ${response.statusText}`);
    }

    const data = await response.json();
    return data as T;
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

  private async getUserInfo(userId: string): Promise<RESTGetAPIUserResult> {
    return await this.fetch<RESTGetAPIUserResult>(Routes.user(userId));
  }
}
