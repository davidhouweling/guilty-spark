import { inspect } from "node:util";
import type { verifyKey as discordInteractionsVerifyKey } from "discord-interactions";
import type {
  APIApplicationCommandInteraction,
  APIApplicationCommandInteractionDataBasicOption,
  APIApplicationCommandSubcommandOption,
  APIChannel,
  APIInteraction,
  APIInteractionResponseChannelMessageWithSource,
  APIMessage,
  APIMessageComponentButtonInteraction,
  APIModalSubmitInteraction,
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
  MessageFlags,
  APIVersion,
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
  Routes,
} from "discord-api-types/v10";
import type { BaseCommand, BaseInteraction } from "../../commands/base/base.mjs";
import { Preconditions } from "../../base/preconditions.mjs";
import type { DiscordAssociationsRow } from "../database/types/discord_associations.mjs";
import { AssociationReason } from "../database/types/discord_associations.mjs";
import { UnreachableError } from "../../base/unreachable-error.mjs";
import type { LogService } from "../log/types.mjs";
import { EndUserError, EndUserErrorType } from "../../base/end-user-error.mjs";
import { JsonResponse } from "./json-response.mjs";
import { AppEmojis } from "./emoji.mjs";

export const NEAT_QUEUE_BOT_USER_ID = "857633321064595466";

export interface QueueData {
  message: APIMessage;
  queue: number;
  timestamp: Date;
  teams: {
    name: string;
    players: APIUser[];
  }[];
}

export interface DiscordServiceOpts {
  env: Env;
  logService: LogService;
  fetch: typeof fetch;
  verifyKey: typeof discordInteractionsVerifyKey;
}

export interface SubcommandData {
  name: string;
  options: APIApplicationCommandInteractionDataBasicOption[] | undefined;
  mappedOptions: Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>;
}

type VerifyDiscordResponse =
  | { isValid: boolean; interaction?: never; error?: never }
  | { interaction: APIInteraction; isValid: boolean; error?: never }
  | { isValid: boolean; error: string; interaction?: never };

interface InteractionResponse {
  response: JsonResponse;
  jobToComplete?: (() => Promise<void>) | undefined;
}

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
  private readonly logService: LogService;
  private readonly globalFetch: typeof fetch;
  private readonly verifyKey: typeof discordInteractionsVerifyKey;
  private commands: Map<string, BaseCommand> | undefined = undefined;
  private readonly userCache = new Map<string, APIUser>();
  private readonly rateLimitDebounceMap = new Map<string, { timeout: NodeJS.Timeout; data: string }>();

  constructor({ env, logService, fetch, verifyKey }: DiscordServiceOpts) {
    this.env = env;
    this.logService = logService;
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
      this.logService.error(error as Error, new Map([["body", body]]));

      return { isValid: false, error: "Invalid JSON" };
    }
  }

  handleInteraction(interaction: APIInteraction): InteractionResponse {
    this.logService.info(inspect(interaction, { depth: null, colors: this.env.MODE === "development" }));

    const { type } = interaction;
    switch (type) {
      case InteractionType.Ping: {
        return {
          response: new JsonResponse({
            type: InteractionResponseType.Pong,
          }),
        };
      }
      case InteractionType.ApplicationCommand: {
        return this.getCommandToExecute(interaction.data.name, interaction);
      }
      case InteractionType.MessageComponent: {
        return this.getCommandToExecute(
          interaction.data.custom_id,
          interaction as APIMessageComponentButtonInteraction,
        );
      }
      case InteractionType.ModalSubmit: {
        return this.getCommandToExecute(interaction.data.custom_id, interaction);
      }
      case InteractionType.ApplicationCommandAutocomplete: {
        return {
          response: new JsonResponse({
            type: InteractionResponseType.ChannelMessageWithSource,
            data: { content: "Autocomplete not implemented", flags: MessageFlags.Ephemeral },
          } satisfies APIInteractionResponseChannelMessageWithSource),
        };
      }
      default: {
        throw new UnreachableError(type);
      }
    }
  }

  private getCommandToExecute(name: string, interaction: BaseInteraction): InteractionResponse {
    if (!this.commands) {
      this.logService.error("No commands found");

      return {
        response: new JsonResponse({ error: "No commands found" }, { status: 500 }),
      };
    }

    this.logService.info("getCommandToExecute", new Map([["name", name]]));
    const command = this.commands.get(name);
    if (!command) {
      this.logService.warn("Command not found", new Map([["name", name]]));

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
      mappedOptions:
        options?.reduce((acc, option) => {
          acc.set(option.name, option.value);
          return acc;
        }, new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>()) ??
        new Map<string, APIApplicationCommandInteractionDataBasicOption["value"]>(),
    };
  }

  extractModalSubmitData(interaction: APIModalSubmitInteraction): Map<string, string> {
    const data = new Map<string, string>();
    for (const component of interaction.data.components) {
      for (const subComponent of component.components) {
        data.set(subComponent.custom_id, subComponent.value);
      }
    }
    return data;
  }

  async getTeamsFromQueue(channel: string, queue: number | undefined): Promise<QueueData | null> {
    const messages = await this.fetch<APIMessage[]>(Routes.channelMessages(channel), {
      method: "GET",
      queryParameters: { limit: 100 },
    });

    const queueMessage = messages
      .filter((message) => (message.author.bot ?? false) && message.author.id === NEAT_QUEUE_BOT_USER_ID)
      .find(
        (message): boolean =>
          message.embeds.find((embed) =>
            new RegExp(`Winner For Queue#${queue != null ? queue.toString() : ""}`).test(embed.title ?? ""),
          ) != null,
      );
    if (!queueMessage) {
      this.logService.debug(
        "No queue message found",
        new Map([
          ["channel", channel],
          ["queue", queue ?? ""],
        ]),
      );
      return null;
    }

    this.logService.debug("Found queue message", new Map([["queueMessage", JSON.stringify(queueMessage)]]));

    const embed = Preconditions.checkExists(queueMessage.embeds[0], "No embed found");
    const fields = Preconditions.checkExists(embed.fields, "No fields found");
    const playerIds = fields.flatMap((field) => this.extractUserIds(field.value));
    this.logService.debug("Extracted player IDs", new Map([["playerIds", playerIds.map((id) => id).join(", ")]]));

    const playerIdToUserMap = new Map<string, APIUser>();
    for (const playerId of playerIds) {
      const user = await this.getUserInfo(playerId);
      playerIdToUserMap.set(playerId, user);
    }

    const extractedQueueNumber = embed.title != null ? Number(/\b#(\d+)\b/.exec(embed.title)?.[1] ?? 0) : 0;

    return {
      message: queueMessage,
      timestamp: new Date(Preconditions.checkExists(embed.timestamp, "No timestamp found")),
      queue: queue ?? extractedQueueNumber,
      teams: fields.map((field) => ({
        name: field.name,
        players: this.extractUserIds(field.value).map((id) => Preconditions.checkExists(playerIdToUserMap.get(id))),
      })),
    };
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

  private handleError(error: EndUserError | Error, logService: LogService): EndUserError {
    const isHandled = error instanceof EndUserError && error.handled;
    if (!isHandled) {
      logService[error instanceof EndUserError && error.errorType === EndUserErrorType.WARNING ? "warn" : "error"](
        error as Error,
      );
    }

    if (error instanceof Error && error.message === "Too many subrequests.") {
      throw new Error("Too many subrequests.");
    }

    return error instanceof EndUserError
      ? error
      : new EndUserError("An unexpected error has occurred. It has been logged. Sorry for the inconvenience.");
  }

  async updateDeferredReplyWithError(interactionToken: string, error: unknown): Promise<APIMessage | undefined> {
    try {
      const endUserError = this.handleError(error as Error, this.logService);
      return await this.updateDeferredReply(interactionToken, {
        embeds: [endUserError.discordEmbed],
      });
    } catch {
      return undefined;
    }
  }

  async updateMessageWithError(
    channel: string,
    messageId: string,
    error: EndUserError | Error,
  ): Promise<APIMessage | undefined> {
    try {
      const endUserError = this.handleError(error, this.logService);
      return await this.fetch<APIMessage>(Routes.channelMessage(channel, messageId), {
        method: "PATCH",
        body: JSON.stringify({
          embeds: [endUserError.discordEmbed],
        }),
      });
    } catch {
      return undefined;
    }
  }

  async getChannel(channelId: string): Promise<APIChannel> {
    return this.fetch<APIChannel>(Routes.channel(channelId), {
      method: "GET",
    });
  }

  async getGuildChannels(guildId: string): Promise<APIChannel[]> {
    return this.fetch<APIChannel[]>(Routes.guildChannels(guildId), {
      method: "GET",
      queryParameters: { limit: 100 },
    });
  }

  async getMessage(channel: string, messageId: string): Promise<APIMessage> {
    return this.fetch<APIMessage>(Routes.channelMessage(channel, messageId), {
      method: "GET",
    });
  }

  async getMessageFromInteractionToken(interactionToken: string): Promise<RESTGetAPIWebhookWithTokenMessageResult> {
    return this.fetch<RESTGetAPIWebhookWithTokenMessageResult>(
      Routes.webhookMessage(this.env.DISCORD_APP_ID, interactionToken),
    );
  }

  async getMessages(channel: string): Promise<APIMessage[]> {
    return this.fetch<APIMessage[]>(Routes.channelMessages(channel), {
      method: "GET",
    });
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

  async deleteMessage(channelId: string, messageId: string, reason: string): Promise<void> {
    await this.fetch(Routes.channelMessage(channelId, messageId), {
      method: "DELETE",
      headers: {
        "X-Audit-Log-Reason": reason,
      },
    });
  }

  async getUsers(discordIds: string[]): Promise<APIUser[]> {
    // doing it sequentially to better handle rate limit
    const users: APIUser[] = [];
    for (const discordId of discordIds) {
      const user = await this.getUserInfo(discordId);
      users.push(user);
    }

    return users;
  }

  getDiscordUserId(interaction: BaseInteraction): string {
    return Preconditions.checkExists(interaction.member?.user ?? interaction.user, "No user found on interaction").id;
  }

  getEmojiFromName(name: string): string {
    const appEmojiName = name.replace(/[^a-z0-9]/gi, "");
    const emojiId = Preconditions.checkExists(
      AppEmojis.get(name.replace(/[^a-z0-9]/gi, "")),
      `Emoji not found: ${name}`,
    );

    return `<:${appEmojiName}:${emojiId}>`;
  }

  getTimestamp(isoDate: string, format: "F" | "f" | "D" | "d" | "T" | "t" | "R" = "f"): string {
    const unixTime = Math.floor(new Date(isoDate).getTime() / 1000);

    return `<t:${unixTime.toString()}:${format}>`;
  }

  getReadableAssociationReason(association: DiscordAssociationsRow): string {
    const { AssociationReason: associationReason } = association;
    switch (associationReason) {
      case AssociationReason.CONNECTED: {
        return "Connected Halo account";
      }
      case AssociationReason.MANUAL: {
        return "Manually claimed Halo account";
      }
      case AssociationReason.USERNAME_SEARCH: {
        return "Matched Discord Username to Halo account";
      }
      case AssociationReason.DISPLAY_NAME_SEARCH: {
        return `Matched Discord Display Name to Halo account${
          association.DiscordDisplayNameSearched != null ? ` "${association.DiscordDisplayNameSearched}"` : ""
        }`;
      }
      case AssociationReason.GAME_SIMILARITY: {
        return "Fuzzy matched Discord Username / Display name from a previous series";
      }
      case AssociationReason.UNKNOWN: {
        return "Unknown";
      }
      default: {
        throw new UnreachableError(associationReason);
      }
    }
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
    this.logService.debug("Discord API request", new Map([["url", url.toString()]]));
    this.logService.debug("Stored rate limit", new Map([["rateLimit", rateLimit ? { ...rateLimit } : null]]));

    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bot ${this.env.DISCORD_TOKEN}`);
    headers.set("content-type", "application/json;charset=UTF-8");

    const fetchOptions = {
      ...options,
      body: options.body ?? null,
      headers: headers,
    };

    // having to rebind back to global fetch due to Cloudflare Workers
    // https://developers.cloudflare.com/workers/observability/errors/#illegal-invocation-errors
    const boundFetch = this.globalFetch.bind(null);
    const response = await boundFetch(url.toString(), fetchOptions);
    if (!response.ok) {
      this.logService.warn(`Discord API request failed: ${response.status.toString()} ${response.statusText}`);
      if (response.status === 429 && !retry) {
        const rateLimitFromResponse = this.getRateLimitFromResponse(response);

        if (rateLimitFromResponse.reset != null) {
          this.setRateLimitInAppConfig(path, rateLimitFromResponse);

          return this.fetch<T>(path, options, true);
        }
      }

      const error = new Error(
        `Failed to fetch data from Discord API: ${response.status.toString()} ${response.statusText}`,
      );
      const body = await response.text();
      this.logService.error(error, new Map([["body", body]]));

      throw error;
    }

    const rateLimitFromResponse = this.getRateLimitFromResponse(response);
    this.setRateLimitInAppConfig(path, rateLimitFromResponse);

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
    if (!this.userCache.has(userId)) {
      const user = await this.fetch<RESTGetAPIUserResult>(Routes.user(userId));
      this.userCache.set(userId, user);
    }

    return Preconditions.checkExists(this.userCache.get(userId));
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

  private getRateLimitKey(path: string): string {
    const prefix = "rateLimit";
    if (path.startsWith(Routes.user("*").replace("*", ""))) {
      return `${prefix}./users/*`;
    }

    return `${prefix}.${path}`;
  }

  private async getRateLimitFromAppConfig(path: string): Promise<RateLimit | null> {
    const key = this.getRateLimitKey(path);
    const existing = this.rateLimitDebounceMap.get(key);
    if (existing) {
      return JSON.parse(existing.data) as RateLimit;
    }

    const rateLimit = await this.env.APP_DATA.get<RateLimit>(key, { type: "json" });
    return rateLimit;
  }

  private setRateLimitInAppConfig(path: string, rateLimit: RateLimit): void {
    if (rateLimit.reset == null) {
      return;
    }
    const key = this.getRateLimitKey(path);
    const rateLimitData = JSON.stringify(rateLimit);

    const scheduleWrite = (data: string): void => {
      const timeout = setTimeout(() => {
        void this.env.APP_DATA.put(key, data, {
          expirationTtl: rateLimit.resetAfter != null && rateLimit.resetAfter > 60 ? rateLimit.resetAfter : 60,
        });
        this.rateLimitDebounceMap.delete(key);
      }, 1000);

      this.rateLimitDebounceMap.set(key, { timeout, data });
    };

    const existing = this.rateLimitDebounceMap.get(key);
    if (existing) {
      clearTimeout(existing.timeout);
      existing.data = rateLimitData;
      scheduleWrite(existing.data);
    } else {
      scheduleWrite(rateLimitData);
    }
  }
}
