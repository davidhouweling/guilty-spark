import type { LogService, JsonAny } from "./types";

export class AggregatorClient implements LogService {
  private readonly clients: LogService[];

  constructor(clients: LogService[]) {
    this.clients = clients;
  }

  debug(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void {
    for (const client of this.clients) {
      client.debug(message, extra);
    }
  }

  info(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void {
    for (const client of this.clients) {
      client.info(message, extra);
    }
  }

  warn(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void {
    for (const client of this.clients) {
      client.warn(message, extra);
    }
  }

  error(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void {
    for (const client of this.clients) {
      client.error(message, extra);
    }
  }

  fatal(message: unknown, extra?: ReadonlyMap<string, JsonAny>): void {
    for (const client of this.clients) {
      client.fatal(message, extra);
    }
  }
}
