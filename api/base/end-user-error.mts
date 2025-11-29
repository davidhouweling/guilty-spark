import {
  ButtonStyle,
  ComponentType,
  type APIComponentInMessageActionRow,
  type APIEmbed,
  type APIMessageTopLevelComponent,
} from "discord-api-types/v10";
import { UnreachableError } from "./unreachable-error.mjs";

type EndUserErrorAction = "connect" | "retry";

interface EndUserErrorOptions {
  title?: string;
  errorType?: EndUserErrorType;
  innerError?: Error;
  handled?: boolean;
  actions?: EndUserErrorAction[] | undefined;
  data?: Record<string, string>;
}

export enum EndUserErrorType {
  ERROR = "error",
  WARNING = "warning",
}

export enum EndUserErrorColor {
  ERROR = 0xff0000,
  WARNING = 0xffa500,
}

export class EndUserError extends Error {
  readonly endUserMessage: string;
  readonly title: string;
  readonly errorType: EndUserErrorType;
  readonly handled: boolean;
  readonly actions: EndUserErrorAction[] | undefined;
  readonly data: Record<string, string>;

  constructor(
    endUserMessage: string,
    {
      title = "Something went wrong",
      errorType = EndUserErrorType.ERROR,
      innerError,
      handled = false,
      actions,
      data = {},
    }: EndUserErrorOptions = {},
  ) {
    super(innerError?.message ?? endUserMessage);
    this.name = "EndUserError";
    this.stack = innerError?.stack ?? "No stack trace available";
    this.endUserMessage = endUserMessage;
    this.title = title;
    this.errorType = errorType;
    this.handled = handled;
    this.actions = actions;
    this.data = data;
  }

  get discordEmbed(): APIEmbed {
    const data = Object.entries(this.data);

    return {
      title: this.title,
      description: this.endUserMessage,
      color: this.errorType === EndUserErrorType.ERROR ? EndUserErrorColor.ERROR : EndUserErrorColor.WARNING,
      fields:
        data.length > 0
          ? [
              {
                name: "Additional Information",
                value: data.map(([key, value]) => `**${key}**: ${value}`).join("\n"),
              },
            ]
          : [],
    };
  }

  get discordActions(): APIMessageTopLevelComponent[] {
    const components: APIComponentInMessageActionRow[] = [];
    if (this.actions != null) {
      for (const action of this.actions) {
        switch (action) {
          case "connect": {
            components.push({
              type: ComponentType.Button,
              label: "Connect",
              style: ButtonStyle.Primary,
              custom_id: "btn_connect_initiate", // TODO: work out how to share with connect command that doesn't create circular dependency
              emoji: {
                name: "🔗",
              },
            });
            break;
          }
          case "retry": {
            components.push({
              type: ComponentType.Button,
              label: "Retry",
              style: ButtonStyle.Primary,
              custom_id: "btn_stats_retry",
              emoji: {
                name: "🔄",
              },
            });
            break;
          }
          default: {
            throw new UnreachableError(action);
          }
        }
      }
    }

    return components.length > 0 ? [{ type: ComponentType.ActionRow, components }] : [];
  }

  static fromDiscordEmbed(embed: APIEmbed): EndUserError | undefined {
    if (
      (embed.color !== EndUserErrorColor.ERROR && embed.color !== EndUserErrorColor.WARNING) ||
      embed.title === undefined ||
      embed.description === undefined
    ) {
      return undefined;
    }

    const { title, description: endUserMessage } = embed;
    const errorType = embed.color === EndUserErrorColor.ERROR ? EndUserErrorType.ERROR : EndUserErrorType.WARNING;
    const data: Record<string, string> = {};
    if (embed.fields?.[0]?.name === "Additional Information") {
      const fields = embed.fields[0].value.split("\n");
      for (const field of fields) {
        const [key, value] = field.split(": ");
        if (key != null && value != null) {
          const formattedKey = key.replace(/\*\*/g, "").trim();
          data[formattedKey] = value.trim();
        }
      }
    }

    return new EndUserError(endUserMessage, {
      title,
      errorType,
      data,
    });
  }

  appendData(newData: Record<string, string>): void {
    for (const [key, value] of Object.entries(newData)) {
      this.data[key] = value;
    }
  }
}
