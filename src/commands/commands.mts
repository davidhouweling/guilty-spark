import { Collection } from "discord.js";
import { PingCommand } from "./utility/ping.mjs";
import { StatsCommand } from "./stats/stats.mjs";
import { Services } from "../services/install.mjs";

export function getCommands(services: Services) {
  return new Collection(
    [new PingCommand(services), new StatsCommand(services)].map((command) => [command.data.name, command]),
  );
}
