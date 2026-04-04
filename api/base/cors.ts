/**
 * CORS configuration and helper functions for API routes
 */

interface CorsConfig {
  readonly allowedOrigins: readonly string[];
  readonly allowedMethods: string;
  readonly allowedHeaders: string;
  readonly maxAge: number;
}

const CORS_CONFIG: CorsConfig = {
  // Allowed origins for CORS requests
  allowedOrigins: [
    "http://localhost:4321", // Development
    "https://guilty-spark.app", // Production
    "https://www.guilty-spark.app", // Production (www)
  ],
  allowedMethods: "GET, POST, OPTIONS",
  allowedHeaders: "Content-Type",
  maxAge: 86400, // 24 hours
};

/**
 * Check if the origin is allowed for CORS requests
 */
function isOriginAllowed(origin: string | null): boolean {
  if (origin === null) {
    return false;
  }

  return CORS_CONFIG.allowedOrigins.includes(origin);
}

/**
 * Get CORS headers for a given origin
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {};

  if (isOriginAllowed(origin) && origin !== null) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = CORS_CONFIG.allowedMethods;
    headers["Access-Control-Allow-Headers"] = CORS_CONFIG.allowedHeaders;
    headers["Access-Control-Max-Age"] = String(CORS_CONFIG.maxAge);
  }

  return headers;
}

/**
 * Handle CORS preflight OPTIONS request
 */
export function handleCorsPreflightRequest(request: Request): Response {
  const origin = request.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * Add CORS headers to a response
 */
export function addCorsHeaders(response: Response, request: Request): Response {
  const origin = request.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

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
