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

const { preflight, corsify } = cors({
  origin: ALLOWED_ORIGINS,
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
