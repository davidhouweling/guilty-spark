import type { RESTError } from "discord-api-types/v10";

export class DiscordError extends Error {
  public readonly httpStatus: number;
  public readonly restError: RESTError;

  public constructor(httpStatus: number, restError: RESTError) {
    super(`Discord API Error (HTTP ${httpStatus.toString()}): ${JSON.stringify(restError)}`);

    this.name = "DiscordError";
    this.httpStatus = httpStatus;
    this.restError = restError;
  }
}
