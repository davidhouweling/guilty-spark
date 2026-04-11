/**
 * CORS configuration and helper functions for API routes
 */

interface CorsConfig {
  readonly allowedMethods: string;
  readonly allowedHeaders: string;
  readonly maxAge: number;
}

const CORS_CONFIG: CorsConfig = {
  allowedMethods: "GET, POST, PATCH, OPTIONS",
  allowedHeaders: "Content-Type, x-proxy-auth",
  maxAge: 86400, // 24 hours
};

function getConfiguredFrontendOrigins(env: Env): readonly string[] {
  const configuredOrigins = [env.FRONTEND_URL, env.PAGES_URL, "http://localhost:4321", "https://guilty-spark.app", "https://www.guilty-spark.app"];
  const uniqueOrigins = new Set<string>();

  for (const origin of configuredOrigins) {
    if (origin == null || origin === "") {
      continue;
    }

    try {
      const parsedOrigin = new URL(origin).origin;
      uniqueOrigins.add(parsedOrigin);
    } catch {
      continue;
    }
  }

  return Array.from(uniqueOrigins);
}

/**
 * Check if the origin is allowed for CORS requests
 */
function isOriginAllowed(origin: string | null, env: Env): boolean {
  if (origin === null) {
    return false;
  }

  return getConfiguredFrontendOrigins(env).includes(origin);
}

/**
 * Get CORS headers for a given origin
 */
export function getCorsHeaders(origin: string | null, env: Env): Record<string, string> {
  const headers: Record<string, string> = {};

  if (isOriginAllowed(origin, env) && origin !== null) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = CORS_CONFIG.allowedMethods;
    headers["Access-Control-Allow-Headers"] = CORS_CONFIG.allowedHeaders;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Vary"] = "Origin";
    headers["Access-Control-Max-Age"] = String(CORS_CONFIG.maxAge);
  }

  return headers;
}

/**
 * Handle CORS preflight OPTIONS request
 */
export function handleCorsPreflightRequest(request: Request, env: Env): Response {
  const origin = request.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin, env);

  if (Object.keys(corsHeaders).length === 0) {
    return new Response("Forbidden", { status: 403 });
  }

  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * Add CORS headers to a response
 */
export function addCorsHeaders(response: Response, request: Request, env: Env): Response {
  const origin = request.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin, env);

  // If no CORS headers needed (origin not allowed), return original response
  if (Object.keys(corsHeaders).length === 0) {
    return response;
  }

  // Clone the response and add CORS headers
  const newResponse = new Response(response.body, response);

  for (const [key, value] of Object.entries(corsHeaders)) {
    newResponse.headers.set(key, value);
  }

  return newResponse;
}
