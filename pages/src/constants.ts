/// <reference types="astro/client" />

/**
 * Shared application constants
 */

export const DISCORD_INVITE_URL =
  "https://discord.com/oauth2/authorize?client_id=1290269474536034357&permissions=311385476096&integration_type=0&scope=bot+applications.commands";

export const SUPPORT_SERVER_URL = "https://discord.gg/WS7zG8GDKY";

export const GITHUB_URL = "https://github.com/davidhouweling/guilty-spark";

export const GITHUB_REPO_OWNER = "davidhouweling";
export const GITHUB_REPO_NAME = "guilty-spark";

// API host for WebSocket and API connections
// In development: localhost:8787
// In production: api.guilty-spark.app
export const API_HOST = import.meta.env.PUBLIC_API_HOST ?? "api.guilty-spark.app";
