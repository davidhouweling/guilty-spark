export function createApiUrl(apiHost: string, path: string): URL {
  const url = new URL(apiHost);
  const basePath = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  url.pathname = `${basePath}${normalizedPath}`;
  return url;
}
