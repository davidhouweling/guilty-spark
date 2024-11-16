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
  RESTPatchAPIChannelMessageResult,
  RESTPostAPIChannelMessageJSONBody,
  RESTPostAPIChannelMessageResult,
  RESTPostAPIChannelMessagesThreadsJSONBody,
  RESTPostAPIChannelThreadsResult,
  RESTPostAPIWebhookWithTokenJSONBody,
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

interface DiscordServiceOpts {
  env: Env;
}

export interface SubcommandData {
  name: string;
  options: APIApplicationCommandInteractionDataBasicOption[] | undefined;
  mappedOptions: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]> | undefined;
}

// originally this was built to wrap discord.js and use the provided client
// but in a move to make it work with Cloud Workers (such as Cloudflare Workers or AWS Lambda)
// replacing the outer workings with the expectations of discord HTTP interactions
// but keep the underlying logic the same, so this acts to transform between the two
export class DiscordService {
  private readonly env: Env;
  private commands: Map<string, BaseCommand> | undefined = undefined;

  constructor({ env }: DiscordServiceOpts) {
    this.env = env;
  }

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
      console.trace(error);

      return { isValid: false, error: "Invalid JSON" };
    }
  }

  handleInteraction(interaction: APIInteraction): {
    response: JsonResponse;
    jobToComplete?: Promise<void> | undefined;
  } {
    switch (interaction.type) {
      case InteractionType.Ping: {
        return {
          response: new JsonResponse({
            type: InteractionResponseType.Pong,
          }),
        };
      }
      case InteractionType.ApplicationCommand: {
        if (!this.commands) {
          console.trace("No commands found");
          return {
            response: new JsonResponse({ error: "No commands found" }, { status: 500 }),
          };
        }

        const command = this.commands.get(interaction.data.name);
        if (!command) {
          console.warn("Command not found");

          return {
            response: new JsonResponse({ error: "Command not found" }, { status: 400 }),
          };
        }

        const { response, jobToComplete } = command.execute(interaction);

        return {
          response: new JsonResponse(response),
          jobToComplete,
        };
      }
      default: {
        console.warn("Unknown interaction type");

        return {
          response: new JsonResponse({ error: "Unknown interaction type" }, { status: 400 }),
        };
      }
    }
  }

  extractSubcommand(interaction: APIApplicationCommandInteraction, name: string): SubcommandData {
    if (interaction.data.type !== ApplicationCommandType.ChatInput) {
      throw new Error("Unexpected interaction type");
    }
    if (interaction.data.name !== name) {
      throw new Error("Unexpected interaction name");
    }
    const subcommand = interaction.data.options?.[0] as APIApplicationCommandSubcommandOption | undefined;
    if (!subcommand) {
      throw new Error("No subcommand found");
    }

    const options = subcommand.options as APIApplicationCommandInteractionDataBasicOption[] | undefined;
    return {
      name: subcommand.name,
      options: options,
      mappedOptions: options?.reduce((acc, option) => {
        acc.set(option.name, option.value);
        return acc;
      }, new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>()),
    };
  }

  async getTeamsFromQueue(channel: string, queue: number): Promise<QueueData | null> {
    const messages = await this.fetch<APIMessage[]>(Routes.channelMessages(channel), {
      method: "GET",
      queryParameters: { limit: 100 },
    });
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

  getAcknowledgeResponse(ephemeral = false): APIInteractionResponse {
    const data: { flags?: MessageFlags } = {};
    if (ephemeral) {
      data.flags = MessageFlags.Ephemeral;
    }

    return { type: InteractionResponseType.DeferredChannelMessageWithSource, data };
  }

  async updateDeferredReply(interactionToken: string, data: RESTPostAPIWebhookWithTokenJSONBody) {
    const response = await this.fetch<RESTPatchAPIChannelMessageResult>(
      Routes.webhookMessage(this.env.DISCORD_APP_ID, interactionToken),
      { method: "PATCH", body: JSON.stringify(data) },
    );
    return response;
  }

  getMessageFromInteractionToken(interactionToken: string) {
    return this.fetch<RESTGetAPIWebhookWithTokenMessageResult>(
      Routes.webhookMessage(this.env.DISCORD_APP_ID, interactionToken),
    );
  }

  createMessage(channel: string, data: RESTPostAPIChannelMessageJSONBody) {
    return this.fetch<RESTPostAPIChannelMessageResult>(Routes.channelMessages(channel), {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  startThreadFromMessage(
    channel: string,
    message: string,
    name: string,
    autoArchiveDuration: 60 | 1440 | 4320 | 10080 = 60,
  ) {
    if (name.length > 100) {
      throw new Error("Thread name must be 100 characters or fewer");
    }

    const data: RESTPostAPIChannelMessagesThreadsJSONBody = {
      name,
      auto_archive_duration: autoArchiveDuration,
    };

    return this.fetch<RESTPostAPIChannelThreadsResult>(Routes.threads(channel, message), {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  private async fetch<T>(
    path: string,
    options: RequestInit &
      (
        | { method: "GET"; queryParameters?: Record<string, string | number>; body?: never }
        | { method: "PUT" | "POST" | "PATCH" | "DELETE"; body?: RequestInit["body"]; queryParameters?: never }
      ) = {
      method: "GET",
    },
  ) {
    const url = new URL(`/api/v${APIVersion}${path}`, "https://discord.com");
    if (options.method === "GET" && options.queryParameters) {
      for (const [key, value] of Object.entries(options.queryParameters)) {
        url.searchParams.set(key, value.toString());
      }
    }

    const fetchOptions = {
      ...options,
      body: options.body ?? null,
      headers: {
        Authorization: `Bot ${this.env.DISCORD_TOKEN}`,
        "content-type": "application/json;charset=UTF-8",
        ...options.headers,
      },
    };

    const response = await fetch(url.toString(), fetchOptions);
    if (!response.ok) {
      throw new Error(`Failed to fetch data from Discord API: ${response.status.toString()} ${response.statusText}`);
    }

    if (response.status === 204) {
      return {} as T;
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
