import "dotenv/config";
import { REST, Routes } from "discord.js";
import { getCommands } from "./commands/commands.mjs";
import { Services } from "./services/install.mjs";
import { Preconditions } from "./base/preconditions.mjs";

const env: Pick<Env, "DISCORD_APP_ID" | "DISCORD_TOKEN"> = {
  DISCORD_APP_ID: Preconditions.checkExists(process.env["DISCORD_APP_ID"], "DISCORD_APP_ID"),
  DISCORD_TOKEN: Preconditions.checkExists(process.env["DISCORD_TOKEN"], "DISCORD_TOKEN"),
};

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(env.DISCORD_TOKEN);

const commands = getCommands({} as Services);

// and deploy your commands!
console.log(`Started refreshing ${commands.size.toString()} application (/) commands.`);

// The put method is used to fully refresh all commands in the guild with the current set
const data = (await rest.put(Routes.applicationCommands(env.DISCORD_APP_ID), {
  body: commands.mapValues(({ data }) => data.toJSON()),
})) as unknown[];
console.log(data);

console.log(`Successfully reloaded ${data.length.toString()} application (/) commands.`);
