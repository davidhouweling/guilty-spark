import { Preconditions } from "./utils/preconditions.mjs";

export const config = {
  DISCORD_APP_ID: Preconditions.checkExists(process.env["DISCORD_APP_ID"]),
  DISCORD_TOKEN: Preconditions.checkExists(process.env["DISCORD_TOKEN"]),
  DISCORD_PUBLIC_KEY: Preconditions.checkExists(process.env["DISCORD_PUBLIC_KEY"]),

  XBOX_USERNAME: Preconditions.checkExists(process.env["XBOX_USERNAME"]),
  XBOX_PASSWORD: Preconditions.checkExists(process.env["XBOX_PASSWORD"]),
};
