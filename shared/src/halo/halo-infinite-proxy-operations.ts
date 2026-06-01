import type { HaloInfiniteClient } from "halo-infinite-api";

export type HaloProxyHttpMethod = "GET" | "POST";

interface HaloProxyOperationDefinition {
  readonly httpMethod: HaloProxyHttpMethod;
  readonly cacheTtlSeconds: number;
  readonly staleWhileRevalidateSeconds: number;
}

const HALO_PROXY_OPERATION_DEFINITIONS = {
  getMatchSkill: { httpMethod: "GET", cacheTtlSeconds: 604800, staleWhileRevalidateSeconds: 604800 },
  getMatchStats: { httpMethod: "GET", cacheTtlSeconds: 604800, staleWhileRevalidateSeconds: 604800 },
  getMedalsMetadataFile: { httpMethod: "GET", cacheTtlSeconds: 604800, staleWhileRevalidateSeconds: 604800 },
  getSpecificAssetVersion: { httpMethod: "GET", cacheTtlSeconds: 604800, staleWhileRevalidateSeconds: 86400 },
  getPlaylist: { httpMethod: "GET", cacheTtlSeconds: 86400, staleWhileRevalidateSeconds: 3600 },
  getUser: { httpMethod: "GET", cacheTtlSeconds: 86400, staleWhileRevalidateSeconds: 3600 },
  getUsers: { httpMethod: "POST", cacheTtlSeconds: 3600, staleWhileRevalidateSeconds: 3600 },
  getPlaylistCsr: { httpMethod: "GET", cacheTtlSeconds: 86400, staleWhileRevalidateSeconds: 3600 },
  getPlayerMatchCount: { httpMethod: "GET", cacheTtlSeconds: 60, staleWhileRevalidateSeconds: 30 },
  getPlayerMatches: { httpMethod: "GET", cacheTtlSeconds: 60, staleWhileRevalidateSeconds: 30 },
  getUserServiceRecord: { httpMethod: "GET", cacheTtlSeconds: 60, staleWhileRevalidateSeconds: 30 },
} as const satisfies Partial<Record<keyof HaloInfiniteClient, HaloProxyOperationDefinition>>;

export type HaloProxyOperationName = keyof typeof HALO_PROXY_OPERATION_DEFINITIONS;

export function isHaloProxyOperationName(value: string): value is HaloProxyOperationName {
  return Object.hasOwn(HALO_PROXY_OPERATION_DEFINITIONS, value);
}

export function resolveHaloProxyOperation(operation: string): HaloProxyOperationDefinition | null {
  return isHaloProxyOperationName(operation) ? HALO_PROXY_OPERATION_DEFINITIONS[operation] : null;
}

export function buildHaloProxyCacheControl(operation: HaloProxyOperationDefinition): string {
  return `public, max-age=${operation.cacheTtlSeconds.toString()}, stale-while-revalidate=${operation.staleWhileRevalidateSeconds.toString()}`;
}

export function appendHaloProxyArgsToUrl(url: URL, args: readonly unknown[]): void {
  for (const arg of args) {
    url.searchParams.append("arg", JSON.stringify(arg ?? null));
  }
}

export type ParseHaloProxyArgsResult =
  | { readonly ok: true; readonly args: unknown[] }
  | { readonly ok: false; readonly error: string };

export function parseHaloProxyArgsFromUrl(url: URL): ParseHaloProxyArgsResult {
  const rawArgs = url.searchParams.getAll("arg");
  const args: unknown[] = [];

  for (const rawArg of rawArgs) {
    try {
      const parsed: unknown = JSON.parse(rawArg);
      args.push(parsed);
    } catch {
      return { ok: false, error: "Invalid query arguments" };
    }
  }

  return { ok: true, args };
}

export function parseHaloProxyArgsFromBody(body: unknown): ParseHaloProxyArgsResult {
  if (typeof body !== "object" || body === null || !("args" in body)) {
    return { ok: false, error: "Invalid request format" };
  }

  const { args } = body;
  if (!Array.isArray(args)) {
    return { ok: false, error: "Invalid request format" };
  }

  return { ok: true, args };
}
