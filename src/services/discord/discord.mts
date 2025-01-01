import type { verifyKey as discordInteractionsVerifyKey } from "discord-interactions";
import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIApplicationCommandSubcommandOption,
  APIInteraction,
  APIInteractionResponse,
  APIMessage,
  APIUser,
  RESTGetAPIUserResult,
  RESTGetAPIWebhookWithTokenMessageResult,
  RESTPatchAPIChannelMessageResult,
  RESTPostAPIChannelMessageJSONBody,
  RESTPostAPIChannelMessageResult,
  RESTPostAPIChannelMessagesThreadsJSONBody,
  RESTPostAPIChannelThreadsResult,
  RESTPostAPIWebhookWithTokenJSONBody,
} from "discord-api-types/v10";
import {
  APIVersion,
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  Routes,
} from "discord-api-types/v10";
import type { BaseCommand } from "../../commands/base/base.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import { JsonResponse } from "./json-response.mjs";
import { AppEmojis } from "./emoji.mjs";

const NEAT_QUEUE_BOT_USER_ID = "857633321064595466";

export interface QueueData {
  message: APIMessage;
  timestamp: Date;
  teams: {
    name: string;
    players: APIUser[];
  }[];
}

export interface DiscordServiceOpts {
  env: Env;
  fetch: typeof fetch;
  verifyKey: typeof discordInteractionsVerifyKey;
}

export interface SubcommandData {
  name: string;
  options: APIApplicationCommandInteractionDataBasicOption[] | undefined;
  mappedOptions: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]> | undefined;
}

type VerifyDiscordResponse =
  | { isValid: boolean; interaction?: never; error?: never }
  | { interaction: APIInteraction; isValid: boolean; error?: never }
  | { isValid: boolean; error: string; interaction?: never };

/**
 * Rate limit information for a specific path
 * https://github.com/discord/discord-api-docs/blob/main/docs/topics/Rate_Limits.md
 *
 * For most API requests made, we return optional HTTP response headers containing the rate limit encountered during your request.
 */
interface RateLimit {
  /**
   * The number of requests that can be made
   */
  limit: number | undefined;

  /**
   * The number of remaining requests that can be made
   */
  remaining: number | undefined;

  /**
   * Epoch time (seconds since 00:00:00 UTC on January 1, 1970) at which the rate limit resets
   */
  reset: number | undefined;

  /**
   * Total time (in seconds) of when the current rate limit bucket will reset. Can have decimals to match previous millisecond ratelimit precision
   */
  resetAfter: number | undefined;

  /**
   * A unique string denoting the rate limit being encountered (non-inclusive of top-level resources in the path)
   */
  bucket: number | undefined;
}

// originally this was built to wrap discord.js and use the provided client
// but in a move to make it work with Cloud Workers (such as Cloudflare Workers or AWS Lambda)
// replacing the outer workings with the expectations of discord HTTP interactions
// but keep the underlying logic the same, so this acts to transform between the two
export class DiscordService {
  private readonly env: Env;
  private readonly globalFetch: typeof fetch;
  private readonly verifyKey: typeof discordInteractionsVerifyKey;
  private commands: Map<string, BaseCommand> | undefined = undefined;

  constructor({ env, fetch, verifyKey }: DiscordServiceOpts) {
    this.env = env;
    this.globalFetch = fetch;
    this.verifyKey = verifyKey;
  }

  setCommands(commands: Map<string, BaseCommand>): void {
    this.commands = commands;
  }

  async verifyDiscordRequest(request: Request): Promise<VerifyDiscordResponse> {
    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    const body = await request.text();
    const isValidRequest =
      signature != null &&
      timestamp != null &&
      (await this.verifyKey(body, signature, timestamp, this.env.DISCORD_PUBLIC_KEY));

    if (!isValidRequest) {
      return { isValid: false };
    }

    try {
      const parsedInteraction = JSON.parse(body) as APIInteraction;
      return { interaction: parsedInteraction, isValid: true };
    } catch (error) {
      console.error(error);
      console.trace();

      return { isValid: false, error: "Invalid JSON" };
    }
  }

  handleInteraction(interaction: APIInteraction): {
    response: JsonResponse;
    jobToComplete?: (() => Promise<void>) | undefined;
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
          console.error("No commands found");

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
      case InteractionType.MessageComponent:
      case InteractionType.ApplicationCommandAutocomplete:
      case InteractionType.ModalSubmit:
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

  async getTeamsFromQueue(channel: string, queue: number, locale: string): Promise<QueueData | null> {
    const messages = await this.fetch<APIMessage[]>(Routes.channelMessages(channel), {
      method: "GET",
      queryParameters: { limit: 100 },
    });

    const queueMessage = messages
      .filter((message) => (message.author.bot ?? false) && message.author.id === NEAT_QUEUE_BOT_USER_ID)
      .find((message) =>
        message.embeds.find((embed) => new RegExp(`\\b#${queue.toLocaleString(locale)}\\b`).test(embed.title ?? "")),
      );
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

  async updateDeferredReply(
    interactionToken: string,
    data: RESTPostAPIWebhookWithTokenJSONBody,
  ): Promise<RESTPatchAPIChannelMessageResult> {
    const response = await this.fetch<RESTPatchAPIChannelMessageResult>(
      Routes.webhookMessage(this.env.DISCORD_APP_ID, interactionToken),
      { method: "PATCH", body: JSON.stringify(data) },
    );
    return response;
  }

  async getMessageFromInteractionToken(interactionToken: string): Promise<RESTGetAPIWebhookWithTokenMessageResult> {
    return this.fetch<RESTGetAPIWebhookWithTokenMessageResult>(
      Routes.webhookMessage(this.env.DISCORD_APP_ID, interactionToken),
    );
  }

  async createMessage(
    channel: string,
    data: RESTPostAPIChannelMessageJSONBody,
  ): Promise<RESTPostAPIChannelMessageResult> {
    return this.fetch<RESTPostAPIChannelMessageResult>(Routes.channelMessages(channel), {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async startThreadFromMessage(
    channel: string,
    message: string,
    name: string,
    autoArchiveDuration: 60 | 1440 | 4320 | 10080 = 60,
  ): Promise<RESTPostAPIChannelThreadsResult> {
    if (name.length > 100) {
      return Promise.reject(new Error("Thread name must be 100 characters or fewer"));
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

  getEmojiFromName(name: string): string {
    const appEmojiName = name.replace(/[^a-z0-9]/gi, "");
    const emojiId = Preconditions.checkExists(
      AppEmojis.get(name.replace(/[^a-z0-9]/gi, "")),
      `Emoji not found: ${name}`,
    );

    return `<:${appEmojiName}:${emojiId}>`;
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
    retry = false,
  ): Promise<T> {
    const rateLimit = await this.getRateLimitFromAppConfig(path);

    if (rateLimit != null && rateLimit.remaining === 0 && rateLimit.reset != null) {
      const now = Date.now();
      if (now < rateLimit.reset) {
        const timeUntilReset = rateLimit.reset - now;
        await new Promise((resolve) => setTimeout(resolve, timeUntilReset));
      }
    }

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

    // having to rebind back to global fetch due to Cloudflare Workers
    // https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors
    const boundFetch = this.globalFetch.bind(null);
    const response = await boundFetch(url.toString(), fetchOptions);
    if (!response.ok) {
      if (response.status === 429 && !retry) {
        const rateLimitFromResponse = this.getRateLimitFromResponse(response);

        if (rateLimitFromResponse.reset != null) {
          await this.setRateLimitInAppConfig(path, rateLimitFromResponse);

          return this.fetch<T>(path, options, true);
        }
      }

      throw new Error(`Failed to fetch data from Discord API: ${response.status.toString()} ${response.statusText}`);
    }

    const rateLimitFromResponse = this.getRateLimitFromResponse(response);
    await this.setRateLimitInAppConfig(path, rateLimitFromResponse);

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
      if (match[1] != null) {
        ids.push(match[1]);
      }
    }

    return ids;
  }

  private async getUserInfo(userId: string): Promise<RESTGetAPIUserResult> {
    return await this.fetch<RESTGetAPIUserResult>(Routes.user(userId));
  }

  private getRateLimitFromHeader(headers: Headers, key: string): number | undefined {
    const value = headers.get(key);
    if (value == null) {
      return undefined;
    }

    return Number(value);
  }

  private getRateLimitFromResponse(response: Response): RateLimit {
    const { headers } = response;
    const limit = this.getRateLimitFromHeader(headers, "X-RateLimit-Limit");
    const remaining = this.getRateLimitFromHeader(headers, "X-RateLimit-Remaining");
    const reset = this.getRateLimitFromHeader(headers, "X-RateLimit-Reset");
    const resetAfter = this.getRateLimitFromHeader(headers, "X-RateLimit-Reset-After");
    const bucket = this.getRateLimitFromHeader(headers, "X-RateLimit-Bucket");

    return { limit, remaining, reset, resetAfter, bucket };
  }

  private async getRateLimitFromAppConfig(path: string): Promise<RateLimit | null> {
    const serializedRateLimit = await this.env.APP_CONFIG.get(`rateLimit.${path}`);
    if (serializedRateLimit == null) {
      return null;
    }

    const rateLimit = JSON.parse(serializedRateLimit) as RateLimit;
    return rateLimit;
  }

  private async setRateLimitInAppConfig(path: string, rateLimit: RateLimit): Promise<void> {
    if (rateLimit.reset != null) {
      await this.env.APP_CONFIG.put(`rateLimit.${path}`, JSON.stringify(rateLimit), {
        expirationTtl: rateLimit.resetAfter != null && rateLimit.resetAfter > 60 ? rateLimit.resetAfter : 60,
      });
    }
  }
}
