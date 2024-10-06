import { Client, Collection } from "discord.js";
import { PingCommand } from "./utility/ping.mjs";
import { StatsCommand } from "./stats/stats.mjs";

export function getCommands(client: Client) {
  return new Collection(
    [new PingCommand(client), new StatsCommand(client)].map((command) => [command.data.name, command]),
  );
}
