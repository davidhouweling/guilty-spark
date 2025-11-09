import "dotenv/config";
import { inspect } from "util";
import type { RESTPutAPIApplicationCommandsResult } from "discord-api-types/v10";
import { APIVersion, ApplicationCommandType, Routes } from "discord-api-types/v10";
import { getCommands } from "../api/commands/commands.mjs";
import type { Services } from "../api/services/install.mjs";
import { Preconditions } from "../api/base/preconditions.mjs";
import type { ApplicationCommandData } from "../api/commands/base/base.mjs";

const env: Pick<Env, "DISCORD_APP_ID" | "DISCORD_TOKEN"> = {
  DISCORD_APP_ID: Preconditions.checkExists(process.env.DISCORD_APP_ID, "DISCORD_APP_ID"),
  DISCORD_TOKEN: Preconditions.checkExists(process.env.DISCORD_TOKEN, "DISCORD_TOKEN"),
};

const commands = getCommands({} as Services, {} as Env);

// and deploy your commands!
console.log(`Started refreshing ${commands.size.toString()} application (/) commands.`);

const url = new URL(`/api/v${APIVersion}${Routes.applicationCommands(env.DISCORD_APP_ID)}`, "https://discord.com");

console.log("URL:", url.toString());

const commandsToDeployMap = new Map<string, ApplicationCommandData>(
  Array.from(commands.values())
    .flatMap(({ data }) => data)
    .map((data) => {
      if (data.type === ApplicationCommandType.ChatInput) {
        return [data.name, data] as const;
      }
      return undefined;
    })
    .filter((command) => command !== undefined),
);
const commandsToDeploy = Array.from(commandsToDeployMap.values());

console.log("Commands to deploy:", inspect(commandsToDeploy, { depth: null, colors: true }));

// The put method is used to fully refresh all commands in the guild with the current set
const response = await fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${env.DISCORD_TOKEN}`,
    "content-type": "application/json;charset=UTF-8",
  },
  body: JSON.stringify(commandsToDeploy),
});

console.log(`Refreshed commands with status ${response.status.toString()}`);

if (!response.ok) {
  throw new Error(`Failed to refresh commands: ${response.status.toString()} ${response.statusText}`);
}

const data = await response.json<RESTPutAPIApplicationCommandsResult>();
console.log(inspect(data, { depth: null, colors: true }));

console.log(`Successfully reloaded ${data.length.toString()} application (/) commands.`);
