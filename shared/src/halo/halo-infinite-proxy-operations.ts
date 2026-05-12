export type HaloProxyHttpMethod = "GET" | "POST";

interface HaloProxyOperationDefinition {
  readonly httpMethod: HaloProxyHttpMethod;
  /** How long edge/shared caches may serve the response as fresh. */
  readonly cacheTtlSeconds: number;
  /** How long caches may serve stale content while revalidating in the background. */
  readonly staleWhileRevalidateSeconds: number;
}

const HALO_PROXY_OPERATION_DEFINITIONS = {
  // Immutable match data — cache aggressively; matches never change after completion.
  getMatchSkill: { httpMethod: "GET", cacheTtlSeconds: 604800, staleWhileRevalidateSeconds: 604800 },
  getMatchStats: { httpMethod: "GET", cacheTtlSeconds: 604800, staleWhileRevalidateSeconds: 604800 },
  // Static reference data — medals and assets are versioned and never mutate.
  getMedalsMetadataFile: { httpMethod: "GET", cacheTtlSeconds: 604800, staleWhileRevalidateSeconds: 604800 },
  getSpecificAssetVersion: { httpMethod: "GET", cacheTtlSeconds: 604800, staleWhileRevalidateSeconds: 86400 },
  // Semi-static data — changes infrequently; serve stale while refreshing in background.
  getPlaylist: { httpMethod: "GET", cacheTtlSeconds: 86400, staleWhileRevalidateSeconds: 3600 },
  getUser: { httpMethod: "GET", cacheTtlSeconds: 86400, staleWhileRevalidateSeconds: 3600 },
  getUsers: { httpMethod: "GET", cacheTtlSeconds: 3600, staleWhileRevalidateSeconds: 3600 },
  getPlaylistCsr: { httpMethod: "GET", cacheTtlSeconds: 86400, staleWhileRevalidateSeconds: 3600 },
  // Live data — short TTL; allow brief stale window to absorb burst traffic.
  getPlayerMatchCount: { httpMethod: "GET", cacheTtlSeconds: 60, staleWhileRevalidateSeconds: 30 },
  getPlayerMatches: { httpMethod: "GET", cacheTtlSeconds: 60, staleWhileRevalidateSeconds: 30 },
  getUserServiceRecord: { httpMethod: "GET", cacheTtlSeconds: 60, staleWhileRevalidateSeconds: 30 },
} as const satisfies Record<string, HaloProxyOperationDefinition>;

export type HaloProxyOperationName = keyof typeof HALO_PROXY_OPERATION_DEFINITIONS;

export function isHaloProxyOperationName(value: string): value is HaloProxyOperationName {
  return value in HALO_PROXY_OPERATION_DEFINITIONS;
}

export function resolveHaloProxyOperation(methodName: string): HaloProxyOperationDefinition | null {
  return isHaloProxyOperationName(methodName) ? HALO_PROXY_OPERATION_DEFINITIONS[methodName] : null;
}

export function appendHaloProxyArgsToUrl(url: URL, args: readonly unknown[]): void {
  for (const arg of args) {
    url.searchParams.append("arg", JSON.stringify(arg));
  }
}

export function parseHaloProxyArgsFromUrl(url: URL):
  | { readonly ok: true; readonly args: unknown[] }
  | {
      readonly ok: false;
      readonly error: string;
    } {
  const rawArgs = url.searchParams.getAll("arg");
  const args: unknown[] = [];

  for (const rawArg of rawArgs) {
    try {
      args.push(JSON.parse(rawArg) as unknown);
    } catch {
      return { ok: false, error: "Invalid query arguments" };
    }
  }

  return { ok: true, args };
}
