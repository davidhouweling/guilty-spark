import { Preconditions } from "./utils/preconditions.mjs";

export const config = {
  SERVER_PORT: Preconditions.checkExists(process.env["SERVER_PORT"]),
  SERVER_OAUTH2_ENDPOINT: Preconditions.checkExists(process.env["OAUTH2_ENDPOINT"]),

  DISCORD_APP_ID: Preconditions.checkExists(process.env["DISCORD_APP_ID"]),
  DISCORD_TOKEN: Preconditions.checkExists(process.env["DISCORD_TOKEN"]),
  DISCORD_PUBLIC_KEY: Preconditions.checkExists(process.env["DISCORD_PUBLIC_KEY"]),

  TENANT_ID: Preconditions.checkExists(process.env["TENANT_ID"]),
  TENANT_CLIENT_ID: Preconditions.checkExists(process.env["TENANT_CLIENT_ID"]),
  TENANT_CLIENT_SECRET: Preconditions.checkExists(process.env["TENANT_CLIENT_SECRET"]),
};
