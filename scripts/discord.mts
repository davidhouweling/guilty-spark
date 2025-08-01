import "dotenv/config";
import { writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import type { APIGuild } from "discord-api-types/v10";
import { APIVersion, Routes } from "discord-api-types/v10";
import { Preconditions } from "../src/base/preconditions.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env: Pick<Env, "DISCORD_APP_ID" | "DISCORD_TOKEN"> = {
  DISCORD_APP_ID: Preconditions.checkExists(process.env.DISCORD_APP_ID, "DISCORD_APP_ID"),
  DISCORD_TOKEN: Preconditions.checkExists(process.env.DISCORD_TOKEN, "DISCORD_TOKEN"),
};

const url = new URL(
  `/api/v${APIVersion}${Routes.guildMember("1300001976334946326", "1300002105951653941")}`,
  "https://discord.com",
);

console.log("URL:", url.toString());

// The put method is used to fully refresh all commands in the guild with the current set
const response = await fetch(url, {
  method: "GET",
  headers: {
    Authorization: `Bot ${env.DISCORD_TOKEN}`,
    "content-type": "application/json;charset=UTF-8",
  },
});

if (!response.ok) {
  throw new Error(`Failed to refresh commands: ${response.status.toString()} ${response.statusText}`);
}

const data = await response.json<APIGuild>();
await writeFile(path.join(__dirname, "guild-member.json"), JSON.stringify(data, null, 2));
console.log(data);
