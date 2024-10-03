import { Collection } from "discord.js";
import { PingCommand } from "./utility/ping.mjs";

export const commands = new Collection([new PingCommand()].map((command) => [command.data.name, command]));
