import type { AutoRouterType, IRequest } from "itty-router";
import { AutoRouter, cors } from "itty-router";

export type ApiRouter = AutoRouterType<IRequest, [Env], Response>;

const ALLOWED_ORIGINS = [
  "http://localhost:4321", // Development
  "https://dev.guilty-spark.app", // Development
  "https://staging.guilty-spark.app", // Staging
  "https://guilty-spark.app", // Production
  "https://www.guilty-spark.app", // Production (www)
];

// The prefix and "-guilty-spark-web" must fit a 63-character DNS label.
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9][a-z0-9-]{0,45}-guilty-spark-web\.howling-dev\.workers\.dev$/;

const { preflight, corsify } = cors({
  origin: (origin) => (ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN.test(origin) ? origin : undefined),
  credentials: true,
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  maxAge: 86400, // 24 hours
});

export function createApiRouter(): ApiRouter {
  return AutoRouter<IRequest, [Env], Response>({
    before: [preflight],
    finally: [corsify],
  });
}
