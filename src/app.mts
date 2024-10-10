import "dotenv/config";
import { server } from "./server.mjs";
import { services } from "./services/services.mjs";
import { getCommands } from "./commands/commands.mjs";

const { discord } = services;

server(() => {
  void discord.activate(getCommands(discord.client));
});
