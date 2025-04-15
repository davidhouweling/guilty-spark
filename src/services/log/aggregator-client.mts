import type { LogService, JsonAny } from "./types.mjs";

export class AggregatorClient implements LogService {
  private readonly clients: LogService[];

  constructor(clients: LogService[]) {
    this.clients = clients;
  }

  debug(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    for (const client of this.clients) {
      client.debug(error, extra);
    }
  }

  info(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    for (const client of this.clients) {
      client.info(error, extra);
    }
  }

  warn(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    for (const client of this.clients) {
      client.warn(error, extra);
    }
  }

  error(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    for (const client of this.clients) {
      client.error(error, extra);
    }
  }

  fatal(error: Error | string, extra?: ReadonlyMap<string, JsonAny>): void {
    for (const client of this.clients) {
      client.fatal(error, extra);
    }
  }
}
