import "dotenv/config";
import { APIVersion, RESTPutAPIApplicationCommandsResult, Routes } from "discord-api-types/v10";
import { getCommands } from "./commands/commands.mjs";
import { Services } from "./services/install.mjs";
import { Preconditions } from "./base/preconditions.mjs";

const env: Pick<Env, "DISCORD_APP_ID" | "DISCORD_TOKEN"> = {
  DISCORD_APP_ID: Preconditions.checkExists(process.env["DISCORD_APP_ID"], "DISCORD_APP_ID"),
  DISCORD_TOKEN: Preconditions.checkExists(process.env["DISCORD_TOKEN"], "DISCORD_TOKEN"),
};

const commands = getCommands({} as Services);

// and deploy your commands!
console.log(`Started refreshing ${commands.size.toString()} application (/) commands.`);

const url = new URL(`/api/v${APIVersion}${Routes.applicationCommands(env.DISCORD_APP_ID)}`, "https://discord.com");

console.log("URL:", url.toString());

// The put method is used to fully refresh all commands in the guild with the current set
const response = await fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${env.DISCORD_TOKEN}`,
    "content-type": "application/json;charset=UTF-8",
  },
  body: JSON.stringify([...commands.values()].map(({ data }) => data)),
});

console.log(`Refreshed commands with status ${response.status.toString()}`);

if (!response.ok) {
  throw new Error(`Failed to refresh commands: ${response.status.toString()} ${response.statusText}`);
}

const data = await response.json<RESTPutAPIApplicationCommandsResult>();
console.log(data);

console.log(`Successfully reloaded ${data.length.toString()} application (/) commands.`);
