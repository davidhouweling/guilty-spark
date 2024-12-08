import { Services } from "../services/install.mjs";
import { StatsCommand } from "./stats/stats.mjs";

export function getCommands(services: Services) {
  return new Map([new StatsCommand(services)].map((command) => [command.data.name, command]));
}
