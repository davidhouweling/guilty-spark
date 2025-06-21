import type { APIEmbed } from "discord-api-types/v10";

interface EndUserErrorOptions {
  title?: string;
  errorType?: EndUserErrorType;
  innerError?: Error;
  handled?: boolean;
  callbackType?: "stats" | undefined;
  data?: Record<string, string>;
}

export enum EndUserErrorType {
  ERROR = "error",
  WARNING = "warning",
}

export enum EndUserErrorColor {
  ERROR = 0xff0000,
  WARNING = 0xffff00,
}

export class EndUserError extends Error {
  readonly endUserMessage: string;
  readonly title: string;
  readonly errorType: EndUserErrorType;
  readonly handled: boolean;
  readonly callbackType: "stats" | undefined;
  readonly data: Record<string, string>;

  constructor(
    endUserMessage: string,
    {
      title = "Something went wrong",
      errorType = EndUserErrorType.ERROR,
      innerError,
      handled = false,
      callbackType,
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
    this.callbackType = callbackType;
    this.data = data;
  }

  get discordEmbed(): APIEmbed {
    const data = Object.entries(this.data);
    if (this.callbackType) {
      data.unshift(["Callback", this.callbackType]);
    }

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
    let callbackType: "stats" | undefined;
    if (embed.fields?.[0]?.name === "Additional Information") {
      const fields = embed.fields[0].value.split("\n");
      for (const field of fields) {
        const [key, value] = field.split(": ");
        if (key != null && value != null) {
          if (key === "Callback") {
            callbackType = value.trim() as "stats";
          } else {
            data[key.replace(/\*\*/g, "").trim()] = value.trim();
          }
        }
      }
    }

    return new EndUserError(endUserMessage, {
      title,
      errorType,
      callbackType,
      data,
    });
  }

  appendData(newData: Record<string, string>): void {
    for (const [key, value] of Object.entries(newData)) {
      this.data[key] = value;
    }
  }
}
