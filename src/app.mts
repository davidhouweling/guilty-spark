import "dotenv/config";
import { installServices } from "./services/install.mjs";
import { getCommands } from "./commands/commands.mjs";

const services = installServices();
const { discordService } = services;

await discordService.activate(getCommands(services));
