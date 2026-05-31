import type { AutoRouterType } from "itty-router";
import { AutoRouter, cors } from "itty-router";

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
  allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowHeaders: ["Content-Type"],
  maxAge: 86400, // 24 hours
});

export function createApiRouter(): AutoRouterType {
  return AutoRouter({
    before: [preflight],
    finally: [corsify],
  });
}
