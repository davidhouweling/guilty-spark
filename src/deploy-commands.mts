import "dotenv/config";
import { REST, Routes } from "discord.js";
import { config } from "./config.mjs";
import { getCommands } from "./commands/commands.mjs";
import { Services } from "./services/install.mjs";

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(config.DISCORD_TOKEN);

const commands = getCommands({} as Services);

// and deploy your commands!
console.log(`Started refreshing ${commands.size.toString()} application (/) commands.`);

// The put method is used to fully refresh all commands in the guild with the current set
const data = (await rest.put(Routes.applicationCommands(config.DISCORD_APP_ID), {
  body: commands.mapValues(({ data }) => data.toJSON()),
})) as unknown[];
console.log(data);

console.log(`Successfully reloaded ${data.length.toString()} application (/) commands.`);
