import "dotenv/config";
import { Client, GatewayIntentBits, REST, Routes } from "discord.js";

import { Preconditions } from "./utils/preconditions.mjs";
import { getCommands } from "./commands/commands.mjs";

const DISCORD_TOKEN = Preconditions.checkExists(process.env["DISCORD_TOKEN"]);
const APP_ID = Preconditions.checkExists(process.env["APP_ID"]);

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(DISCORD_TOKEN);

const commands = getCommands(new Client({ intents: [GatewayIntentBits.Guilds] }));

// and deploy your commands!
console.log(`Started refreshing ${commands.size.toString()} application (/) commands.`);

// The put method is used to fully refresh all commands in the guild with the current set
const data = (await rest.put(Routes.applicationCommands(APP_ID), {
  body: commands.mapValues(({ data }) => data.toJSON()),
})) as unknown[];
console.log(data);

console.log(`Successfully reloaded ${data.length.toString()} application (/) commands.`);
