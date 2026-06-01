import { vi } from "vitest";

function cacheKey(request: RequestInfo | URL): string {
  if (typeof request === "string") {
    return request;
  }
  if (request instanceof URL) {
    return request.toString();
  }
  return request.url;
}

export function aFakeCache(): Cache {
  const store = new Map<string, Response>();

  const cache: Pick<Cache, "match" | "put" | "delete"> = {
    match: vi.fn<Cache["match"]>(async (request) => {
      const stored = store.get(cacheKey(request));
      return Promise.resolve(stored ? stored.clone() : undefined);
    }),
    put: vi.fn<Cache["put"]>(async (request, response) => {
      store.set(cacheKey(request), response.clone());
      return Promise.resolve();
    }),
    delete: vi.fn<Cache["delete"]>(async (request) => Promise.resolve(store.delete(cacheKey(request)))),
  };

  return cache;
}

export function aFakeCacheStorage(): CacheStorage {
  const storage: Pick<CacheStorage, "default"> = {
    default: aFakeCache(),
  };

  return storage as CacheStorage;
}
