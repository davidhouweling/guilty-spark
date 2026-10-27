export const IMMUTABLE_RESPONSE_TTL_SECONDS = 604800;

const IMMUTABLE_PATH_PATTERNS = [
  /^\/hi\/matches\/[^/]+\/stats$/i,
  /^\/hi\/maps\/[^/]+\/versions\/[^/]+$/i,
  /^\/hi\/ugcgamevariants\/[^/]+\/versions\/[^/]+$/i,
];

export function isImmutableHaloResource(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    return IMMUTABLE_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
  } catch {
    return false;
  }
}

function isCacheControlPrivateOrNoStore(cacheControl: string): boolean {
  const lower = cacheControl.toLowerCase();
  return lower.includes("no-store") || lower.includes("private");
}

/**
 * Halo marks bot-token responses private, but immutable resources are identical for every
 * caller of this shared bot-token cache, so their cache-control is not honoured.
 */
export function getKvCacheSkipReason(url: string, response: Response): string | null {
  if (response.status !== 200) {
    return `status ${response.status.toString()}`;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("json")) {
    return `content-type ${contentType === "" ? "missing" : contentType}`;
  }

  const cacheControl = response.headers.get("cache-control");
  if (cacheControl != null && isCacheControlPrivateOrNoStore(cacheControl) && !isImmutableHaloResource(url)) {
    return `cache-control ${cacheControl}`;
  }

  return null;
}
